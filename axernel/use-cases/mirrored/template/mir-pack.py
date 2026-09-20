#!/usr/bin/env python3
"""mir-pack <workDir> <artifactDir>

Turns <workDir>/tokens.json (W3C Design Tokens format) into tokens.css and tailwind.config.js,
zips the whole bundle, and copies the files the platform collects into <artifactDir>.
Last line is MIR_OK or MIR_ERROR: <reason>.
"""
import json
import shutil
import sys
import zipfile
from pathlib import Path

# Top-level token group -> Tailwind theme key.
TAILWIND_KEYS = {"color": "colors", "radius": "borderRadius", "spacing": "spacing", "shadow": "boxShadow"}
FONT_KEYS = {"family": "fontFamily", "size": "fontSize", "weight": "fontWeight"}
COLLECTED = ["original.png", "rebuild.png", "diff.png", "page.png"]


def fail(reason):
    print(f"MIR_ERROR: {reason}")
    sys.exit(1)


def css_value(value):
    if isinstance(value, dict) and "unit" in value:
        return f"{value['value']}{value['unit']}"
    if isinstance(value, dict):  # shadow
        return " ".join(css_value(value[k]) for k in ("offsetX", "offsetY", "blur", "spread", "color") if k in value)
    if isinstance(value, list):
        if value and isinstance(value[0], dict):
            return ", ".join(css_value(v) for v in value)
        return ", ".join(f'"{v}"' if " " in str(v) else str(v) for v in value)
    return str(value)


def flatten(node, path=()):
    """Yields (path, css value) for every token under node."""
    if "$value" in node:
        yield path, css_value(node["$value"])
        return
    for key, child in node.items():
        if not key.startswith("$") and isinstance(child, dict):
            yield from flatten(child, path + (key,))


def tailwind_theme(tokens):
    theme = {}
    for path, _ in flatten(tokens):
        group = FONT_KEYS.get(path[1]) if path[0] == "font" and len(path) > 2 else TAILWIND_KEYS.get(path[0])
        if group:
            name = "-".join(path[2:] if path[0] == "font" else path[1:])
            theme.setdefault(group, {})[name] = f"var(--{'-'.join(path)})"
    return theme


def main(work_dir, artifact_dir):
    work, out = Path(work_dir), Path(artifact_dir)
    tokens_path = work / "tokens.json"
    if not tokens_path.exists():
        fail(f"{tokens_path} does not exist")
    try:
        tokens = json.loads(tokens_path.read_text())
    except json.JSONDecodeError as error:
        fail(f"tokens.json is not valid JSON: {error}")
    flat = list(flatten(tokens))
    if not any(path[0] == "color" for path, _ in flat):
        fail('tokens.json needs a top-level "color" group whose leaves have "$value"')

    css = ":root {\n" + "".join(f"  --{'-'.join(path)}: {value};\n" for path, value in flat) + "}\n"
    (work / "tokens.css").write_text(css)
    theme = json.dumps(tailwind_theme(tokens), indent=2)
    (work / "tailwind.config.js").write_text(f"/** Generated from tokens.json. Import tokens.css first. */\nmodule.exports = {{ theme: {{ extend: {theme} }} }}\n")

    out.mkdir(parents=True, exist_ok=True)
    bundle = out / "bundle.zip"
    with zipfile.ZipFile(bundle, "w", zipfile.ZIP_DEFLATED) as archive:
        for name in ("tokens.json", "tokens.css", "tailwind.config.js", "README.md"):
            if (work / name).exists():
                archive.write(work / name, name)
        for folder in ("component", "measure/assets"):
            for file in sorted((work / folder).rglob("*")) if (work / folder).exists() else []:
                if file.is_file():
                    archive.write(file, str(file.relative_to(work)).replace("measure/", ""))
    shutil.copy(tokens_path, out / "tokens.json")
    for name in COLLECTED:
        if (work / "measure" / name).exists():
            shutil.copy(work / "measure" / name, out / name)

    print(f"tokens: {len(flat)}  bundle: {bundle.stat().st_size // 1024} KB")
    print("MIR_OK")


if __name__ == "__main__":
    if len(sys.argv) != 3:
        fail("usage: mir-pack <workDir> <artifactDir>")
    main(*sys.argv[1:])
