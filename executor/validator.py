"""
Code validation for the executor service.

Provides AST-based syntax validation, security checking, column reference
validation with fuzzy matching, and auto-fix for common issues.
"""

import ast
import re
import logging
import difflib
from typing import Optional, List, Dict, Tuple
from dataclasses import dataclass, field

logger = logging.getLogger(__name__)


@dataclass
class ValidationResult:
    """Result of a validation operation."""
    is_valid: bool
    errors: List[str] = field(default_factory=list)
    warnings: List[str] = field(default_factory=list)
    cleaned_code: Optional[str] = None


# Imports that are blocked for security
BLOCKED_IMPORTS = frozenset({
    "os", "sys", "subprocess", "shutil", "socket", "http", "urllib",
    "requests", "pickle", "importlib", "ctypes", "multiprocessing",
    "threading", "signal", "pty", "fcntl", "termios", "resource",
    "syslog", "grp", "pwd", "crypt", "tempfile", "glob", "fnmatch",
    "webbrowser", "antigravity", "turtle", "tkinter", "code", "codeop",
    "compileall", "py_compile",
})

# Builtins that are blocked
BLOCKED_BUILTINS = frozenset({
    "exec", "eval", "compile", "__import__", "open", "input",
    "breakpoint", "exit", "quit",
})

# Dangerous attribute access patterns
DANGEROUS_PATTERNS = [
    r"\bos\.\w+",
    r"\bsys\.\w+",
    r"\bsubprocess\.\w+",
    r"\bshutil\.\w+",
    r"\bsocket\.\w+",
    r"\b__import__\s*\(",
    r"\bopen\s*\(",
    r"\bexec\s*\(",
    r"\beval\s*\(",
    r"\bcompile\s*\(",
    r"\bbreakpoint\s*\(",
    r"\bglobals\s*\(\s*\)",
    r"\bsetattr\s*\(",
    r"\bdelattr\s*\(",
    r"\b__subclasses__",
    r"\b__bases__",
    r"\b__mro__",
]

# Memory bomb patterns
MEMORY_BOMB_PATTERNS = [
    r"\[\s*\d+\s*\]\s*\*\s*\d{6,}",
    r"\*\s*\d{6,}\s*\]",
    r"range\s*\(\s*\d{8,}\s*\)",
    r"pd\.concat\s*\(\s*\[.*\]\s*\*\s*\d{4,}",
    r"\.repeat\s*\(\s*\d{6,}\s*\)",
    r"np\.zeros\s*\(\s*\d{8,}\s*\)",
    r"np\.ones\s*\(\s*\d{8,}\s*\)",
    r"np\.empty\s*\(\s*\d{8,}\s*\)",
]

# Common DataFrame methods to exclude from column detection
DF_METHODS = (
    "head|tail|groupby|merge|sort_values|drop|fillna|dropna|reset_index|"
    "set_index|to_csv|to_json|describe|info|copy|apply|agg|transform|"
    "pivot|melt|stack|unstack|sample|nlargest|nsmallest|query|eval|assign|"
    "rename|columns|index|dtypes|shape|values|loc|iloc|at|iat|iterrows|"
    "itertuples|nunique|unique|value_counts|isna|isnull|notna|notnull|"
    "sum|mean|median|std|var|min|max|count|all|any|corr|cov|cumsum|"
    "cumprod|cummax|cummin|diff|pct_change|rank|shift|rolling|expanding|"
    "pipe|where|mask|clip|round|abs|T|transpose|join|concat|append|astype"
)


def validate_code(code: str) -> ValidationResult:
    """
    Full validation pipeline: syntax, security, memory safety.

    Returns ValidationResult with cleaned_code set to the (possibly auto-fixed) code.
    """
    if not code or not code.strip():
        return ValidationResult(is_valid=False, errors=["Empty code"])

    warnings: List[str] = []
    cleaned = code

    # 1. Try AST parse; auto-fix if needed
    try:
        ast.parse(cleaned)
    except SyntaxError as e:
        fixed = _auto_fix_syntax(cleaned)
        if fixed is not None:
            try:
                ast.parse(fixed)
                cleaned = fixed
                warnings.append(f"Auto-fixed syntax error: {e}")
            except SyntaxError as e2:
                return ValidationResult(
                    is_valid=False,
                    errors=[f"Syntax error: {e2}"],
                    cleaned_code=cleaned,
                )
        else:
            return ValidationResult(
                is_valid=False,
                errors=[f"Syntax error: {e}"],
                cleaned_code=cleaned,
            )

    # 2. Security validation via AST walk
    security_errors = _check_security(cleaned)
    if security_errors:
        return ValidationResult(
            is_valid=False,
            errors=security_errors,
            warnings=warnings,
            cleaned_code=cleaned,
        )

    # 3. Memory safety
    mem_error = _check_memory_safety(cleaned)
    if mem_error:
        return ValidationResult(
            is_valid=False,
            errors=[mem_error],
            warnings=warnings,
            cleaned_code=cleaned,
        )

    # 4. Result assignment check (warning only)
    if not _has_result_assignment(cleaned):
        warnings.append(
            "Code does not assign output to 'result', 'output', or 'fig'. "
            "Results may not be captured."
        )

    # 5. Plotly sanitization
    cleaned, plotly_fixes = _sanitize_plotly(cleaned)
    warnings.extend(plotly_fixes)

    return ValidationResult(
        is_valid=True,
        warnings=warnings,
        cleaned_code=cleaned,
    )


def validate_columns(
    code: str,
    columns_map: Dict[str, List[str]],
) -> List[str]:
    """
    Check if code references columns that don't exist in any known DataFrame.

    Args:
        code: Python code to validate.
        columns_map: Mapping of variable_name -> list of column names.
            Example: {"df": ["Age", "Name"], "patients": ["ID", "Diagnosis"]}

    Returns:
        List of warning strings for invalid column references.
    """
    warnings: List[str] = []

    if not any(columns_map.values()):
        return warnings

    for var_name, columns in columns_map.items():
        if not columns:
            continue

        # bracket access: var['col'] or var["col"]
        bracket_pattern = rf"{re.escape(var_name)}\[[\'\"]([^\'\"]+)[\'\"]\]"
        referenced = set(re.findall(bracket_pattern, code))

        # dot access: var.col (exclude known methods)
        dot_pattern = rf"{re.escape(var_name)}\.(?!{DF_METHODS})([a-zA-Z_][a-zA-Z0-9_]*)"
        for col in re.findall(dot_pattern, code):
            if f"{var_name}.{col}(" not in code:
                referenced.add(col)

        for col in referenced:
            if col in columns:
                continue

            # Check if exists in another DataFrame
            found_in = None
            for other_var, other_cols in columns_map.items():
                if other_var != var_name and col in other_cols:
                    found_in = other_var
                    break

            if found_in:
                warnings.append(
                    f"Column '{col}' NOT in '{var_name}' but EXISTS in '{found_in}'. "
                    f"Use {found_in}['{col}'] instead."
                )
            else:
                all_cols = [c for cols in columns_map.values() for c in cols]
                matches = difflib.get_close_matches(col, all_cols, n=1, cutoff=0.6)
                if matches:
                    warnings.append(
                        f"Column '{col}' not found in '{var_name}'. "
                        f"Did you mean '{matches[0]}'? "
                        f"Available in {var_name}: {columns[:5]}{'...' if len(columns) > 5 else ''}"
                    )
                else:
                    warnings.append(
                        f"Column '{col}' not found in '{var_name}'. "
                        f"Available: {columns[:5]}{'...' if len(columns) > 5 else ''}"
                    )

    return warnings


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------

def _check_security(code: str) -> List[str]:
    """Walk AST to find blocked imports and dangerous calls."""
    errors: List[str] = []
    try:
        tree = ast.parse(code)
    except SyntaxError:
        return errors

    for node in ast.walk(tree):
        # Check imports
        if isinstance(node, ast.Import):
            for alias in node.names:
                base = alias.name.split(".")[0]
                if base in BLOCKED_IMPORTS:
                    errors.append(f"Blocked import: {alias.name}")
        elif isinstance(node, ast.ImportFrom):
            if node.module:
                base = node.module.split(".")[0]
                if base in BLOCKED_IMPORTS:
                    errors.append(f"Blocked import: from {node.module}")
        # Check function calls to blocked builtins
        elif isinstance(node, ast.Call):
            if isinstance(node.func, ast.Name) and node.func.id in BLOCKED_BUILTINS:
                errors.append(f"Blocked builtin call: {node.func.id}()")

    # Regex-based pattern check for things AST might miss
    for pattern in DANGEROUS_PATTERNS:
        if re.search(pattern, code):
            errors.append(f"Dangerous pattern detected: {pattern}")

    return errors


def _check_memory_safety(code: str) -> Optional[str]:
    """Check for memory bomb patterns."""
    for pattern in MEMORY_BOMB_PATTERNS:
        match = re.search(pattern, code, re.IGNORECASE)
        if match:
            return f"Memory safety violation: {match.group()[:50]}..."
    return None


def _has_result_assignment(code: str) -> bool:
    """Check if code assigns to a result variable."""
    patterns = [
        r"\bresult\s*=", r"\boutput\s*=", r"\bfig\s*=",
        r"\bfigure\s*=", r"\bplot\s*=", r"\bchart\s*=", r"\bfig\d+\s*=",
    ]
    return any(re.search(p, code) for p in patterns)


def _auto_fix_syntax(code: str) -> Optional[str]:
    """Attempt to fix common syntax errors."""
    fixed = code

    # Fix trailing backslashes
    lines = fixed.split("\n")
    new_lines = []
    for i, line in enumerate(lines):
        stripped = line.rstrip()
        if stripped.endswith("\\"):
            # Check if next line exists and has content
            has_next = i + 1 < len(lines) and lines[i + 1].strip()
            if not has_next:
                indent = len(line) - len(line.lstrip())
                new_lines.append(" " * indent + stripped[:-1].rstrip())
                continue
        new_lines.append(line)
    fixed = "\n".join(new_lines)

    # Fix unclosed brackets
    for open_ch, close_ch in [("{", "}"), ("[", "]"), ("(", ")")]:
        opens = fixed.count(open_ch)
        closes = fixed.count(close_ch)
        if opens > closes:
            fixed += "\n" + close_ch * (opens - closes)

    try:
        ast.parse(fixed)
        return fixed
    except SyntaxError:
        return None


def _sanitize_plotly(code: str) -> Tuple[str, List[str]]:
    """Fix common Plotly parameter mistakes."""
    fixes: List[str] = []
    sanitized = code

    method_corrections = {
        r"\.update_xaxis\s*\(": ".update_xaxes(",
        r"\.update_yaxis\s*\(": ".update_yaxes(",
        r"\.update_trace\s*\(": ".update_traces(",
        r"\.update_annotation\s*\(": ".update_annotations(",
        r"\.update_shape\s*\(": ".update_shapes(",
    }
    for wrong, correct in method_corrections.items():
        if re.search(wrong, sanitized):
            sanitized = re.sub(wrong, correct, sanitized)
            fixes.append(f"Fixed Plotly method: -> {correct.strip('(')}")

    position_fixes = {
        '"middle right"': '"top right"',
        "'middle right'": "'top right'",
        '"middle left"': '"top left"',
        "'middle left'": "'top left'",
        '"center"': '"top"',
        "'center'": "'top'",
    }
    for invalid, valid in position_fixes.items():
        pattern = rf"annotation_position\s*=\s*{re.escape(invalid)}"
        if re.search(pattern, sanitized):
            sanitized = re.sub(pattern, f"annotation_position={valid}", sanitized)
            fixes.append(f"Fixed annotation_position: {invalid} -> {valid}")

    dash_fixes = {'"dashed"': '"dash"', "'dashed'": "'dash'", '"dotted"': '"dot"', "'dotted'": "'dot'"}
    for invalid, valid in dash_fixes.items():
        pattern = rf"line_dash\s*=\s*{re.escape(invalid)}"
        if re.search(pattern, sanitized):
            sanitized = re.sub(pattern, f"line_dash={valid}", sanitized)
            fixes.append(f"Fixed line_dash: {invalid} -> {valid}")

    return sanitized, fixes
