"""Template variable engine for prompt rendering."""
import re
from datetime import datetime, timedelta


def render_template(template: str, context: dict) -> str:
    """Render template variables in a prompt string.

    Supported variables:
    - {{today}} - today's date (YYYY-MM-DD)
    - {{yesterday}} - yesterday's date
    - {{now}} - current datetime
    - {{date}} - same as today
    - {{time}} - current time (HH:MM:SS)
    - {{inputs.xxx}} - input variables
    - {{steps.step_name.output}} or {{step_name}} - previous step output
    """
    if not template:
        return template

    now = datetime.now()

    # Built-in variables
    builtins = {
        "today": now.strftime("%Y-%m-%d"),
        "yesterday": (now - timedelta(days=1)).strftime("%Y-%m-%d"),
        "now": now.strftime("%Y-%m-%d %H:%M:%S"),
        "date": now.strftime("%Y-%m-%d"),
        "time": now.strftime("%H:%M:%S"),
    }

    def replace_var(match):
        var_name = match.group(1).strip()

        # Check builtins
        if var_name in builtins:
            return builtins[var_name]

        # Check inputs.xxx
        if var_name.startswith("inputs."):
            key = var_name[7:]
            inputs = context.get("inputs", {})
            if inputs and key in inputs:
                return str(inputs[key])
            return match.group(0)

        # Check steps.step_name.output
        if var_name.startswith("steps.") and var_name.endswith(".output"):
            step_name = var_name[6:-7]
            step_key = f"step_{step_name}"
            if step_key in context:
                return str(context[step_key])
            return match.group(0)

        # Check direct step reference: step_name
        step_key = f"step_{var_name}"
        if step_key in context:
            return str(context[step_key])

        return match.group(0)

    result = re.sub(r"\{\{(.+?)\}\}", replace_var, template)
    return result


def evaluate_condition(expr: str, context: dict) -> bool:
    """Evaluate a when-condition expression.

    Supported expressions:
    - "{{steps.step_name.output}}" — truthy check (non-empty output)
    - "{{steps.step_name.output}} contains 'keyword'" — substring check
    - "{{steps.step_name.output}} == 'value'" — equality check
    - "{{steps.step_name.output}} != 'value'" — inequality check
    - "true" / "false" — literal booleans
    """
    if not expr or not expr.strip():
        return True

    rendered = render_template(expr.strip(), context)

    # Literal booleans
    if rendered.lower() in ("true", "1", "yes"):
        return True
    if rendered.lower() in ("false", "0", "no"):
        return False

    # "X contains 'Y'"
    contains_match = re.match(r"^(.+?)\s+contains\s+'(.+?)'$", rendered, re.IGNORECASE)
    if contains_match:
        return contains_match.group(2) in contains_match.group(1)

    # "X == 'Y'"
    eq_match = re.match(r"^(.+?)\s*==\s*'(.+?)'$", rendered)
    if eq_match:
        return eq_match.group(1).strip() == eq_match.group(2)

    # "X != 'Y'"
    neq_match = re.match(r"^(.+?)\s*!=\s*'(.+?)'$", rendered)
    if neq_match:
        return neq_match.group(1).strip() != neq_match.group(2)

    # Fallback: truthy check (non-empty, not an unresolved template)
    return bool(rendered) and not rendered.startswith("{{")
