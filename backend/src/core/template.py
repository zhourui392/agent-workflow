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
