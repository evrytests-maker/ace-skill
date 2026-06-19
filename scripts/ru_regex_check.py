#!/usr/bin/env python3
import re
import sys


RU = re.compile(r"[а-яё]", re.I)
LATIN = re.compile(r"[a-z]", re.I)
VALID_KINDS = {"auto", "name", "word", "phrase"}
VALID_STRATEGIES = {"auto", "regex", "full-form", "stem"}


def is_regex_literal(value):
    value = value.strip()
    return value.startswith("/") and value.rfind("/") > 0


def split_regex(value):
    value = value.strip()
    if is_regex_literal(value):
        end = value.rfind("/")
        return value[1:end], value[end + 1:]
    return value, "iu"


def normalize_pattern(pattern):
    fixes = []
    if "\\\\" in pattern:
        pattern = pattern.replace("\\\\", "\\")
        fixes.append("json-escaped backslashes fixed")
    return pattern, fixes


def build_regex(pattern, flags_text):
    return f"/{pattern}/{flags_text}"


def parse_regex(value):
    pattern, flags_text = split_regex(value)
    pattern, _fixes = normalize_pattern(pattern)
    flags = re.I if "i" in flags_text else 0
    return re.compile(pattern, flags)


def detect_kind(pattern):
    if r"\s" in pattern or "[- ]" in pattern or " " in pattern:
        return "phrase"
    return "word"


def detect_strategy(value):
    return "regex" if is_regex_literal(value) else "full-form"


def has_latin_text(pattern):
    pattern = pattern.replace("\\\\", "\\")
    without_escapes = re.sub(r"\\+.", "", pattern)
    return LATIN.search(without_escapes) is not None


def has_ru_boundary(pattern):
    return any(
        marker in pattern
        for marker in (
            "[^а-яёА-ЯЁ]",
            "[^а-яА-ЯёЁ]",
            "(?<![а-яёА-ЯЁ])",
            "(?<![а-яА-ЯёЁ])",
            "(?![а-яёА-ЯЁ])",
            "(?![а-яА-ЯёЁ])",
            "(?=[^а-яёА-ЯЁ]|$)",
            "(?=[^а-яА-ЯёЁ]|$)",
        )
    )


def cyrillic_runs(pattern):
    cleaned = re.sub(r"\[[^\]]*\]", " ", pattern)
    cleaned = re.sub(r"\([^)]*\)", " ", cleaned)
    return re.findall(r"[А-Яа-яЁё]+", cleaned)


def allows_lowercase_initial(pattern):
    return bool(re.search(r"\[[А-ЯЁ][а-яё]\]", pattern))


def extract_option(args, name, valid_values):
    value = "auto"
    cleaned = []
    i = 0
    while i < len(args):
        arg = args[i]
        if arg == f"--{name}":
            if i + 1 >= len(args):
                return value, cleaned, f"--{name} requires: {', '.join(sorted(valid_values))}"
            value = args[i + 1]
            i += 2
            continue
        if arg.startswith(f"--{name}="):
            value = arg.split("=", 1)[1]
            i += 1
            continue
        cleaned.append(arg)
        i += 1

    if value not in valid_values:
        return value, cleaned, f"unknown {name}: {value}; expected: {', '.join(sorted(valid_values))}"
    return value, cleaned, None


def lint_regex(value, kind="auto", strategy="auto"):
    pattern, flags_text = split_regex(value)
    pattern, fixes = normalize_pattern(pattern)
    flags = re.I if "i" in flags_text else 0
    errors = []
    warnings = []
    detected_kind = detect_kind(pattern)
    active_kind = detected_kind if kind == "auto" else kind
    detected_strategy = detect_strategy(value)
    active_strategy = detected_strategy if strategy == "auto" else strategy

    for flag in flags_text:
        if flag not in "iugms":
            warnings.append(f"unknown js flag ignored: {flag}")
    if "u" in flags_text:
        warnings.append("js flag 'u' is okay in SillyTavern, ignored by Python checker")
    if "g" in flags_text:
        warnings.append("js flag 'g' is ignored because checker tests each word once")

    try:
        re.compile(pattern, flags)
    except re.error as error:
        errors.append(f"regex syntax error: {error}")

    if not RU.search(pattern):
        errors.append("not a RU key: key has no Cyrillic letters")
    if has_latin_text(pattern):
        warnings.append("latin text found; checker still skips non-RU candidate words")
    if r"\s*" in pattern:
        warnings.append(r"logic warning: \s* allows zero spaces, so glued words like 'сборкипк' can match; use \s+ if space is required")
    if active_strategy == "regex" and not has_ru_boundary(pattern):
        warnings.append(r"strict PDF: regex key should use Cyrillic boundaries, not \b or bare substring matching")
    if active_kind in {"name", "word"} and detected_kind == "phrase":
        warnings.append(f"kind warning: marked as {active_kind}, but pattern looks like a phrase key; check spaces/hyphen variants")
    if active_kind == "phrase" and detected_kind != "phrase":
        warnings.append("kind warning: marked as phrase, but no visible space/\\s/[- ] separator was found")

    if active_kind == "name" and active_strategy == "regex":
        if "i" in flags_text:
            warnings.append("strict PDF: proper-name regex usually stays case-sensitive; test lowercase as negative unless lowercase is intentional")
        if allows_lowercase_initial(pattern):
            warnings.append("strict PDF: proper-name pattern allows lowercase initial like [Гг]; prefer uppercase-only unless intentional")
    if active_kind == "phrase":
        warnings.append("strict PDF: phrase keys are less preferred; use only when the phrase is uniquely meaningful and test word order/separators")
    if active_strategy == "full-form" and r"[а-яё]*" in pattern:
        warnings.append("strategy warning: full-form keys should list exact forms, not broad [а-яё]* suffixes")
    if active_strategy == "stem":
        runs = cyrillic_runs(pattern)
        short = [run for run in runs if len(run) <= 3]
        if short:
            warnings.append(f"strategy warning: short stems/roots are ambiguous in RU: {', '.join(short[:5])}")
    if active_kind == "word" and active_strategy == "regex" and r"[а-яё]*" in pattern:
        warnings.append("word warning: broad suffix [а-яё]* may match too many word forms; prefer explicit endings for important keys")

    print(f"INFO: key kind = {active_kind} (detected: {detected_kind})")
    print(f"INFO: key strategy = {active_strategy} (detected: {detected_strategy})")
    for fix in fixes:
        print(f"FIX: {fix}")
    for warning in warnings:
        print(f"WARN: {warning}")
    for error in errors:
        print(f"ERROR: {error}")
    if not errors:
        print("OK: regex/key syntax is valid for this checker")
    return 0 if not errors else 1


def fix_regex(value, strict_space=False):
    pattern, flags_text = split_regex(value)
    pattern, fixes = normalize_pattern(pattern)

    if strict_space and r"\s*" in pattern:
        pattern = pattern.replace(r"\s*", r"\s+")
        fixes.append(r"strict-space fixed: \s* -> \s+")

    fixed = build_regex(pattern, flags_text)
    for fix in fixes:
        print(f"FIX: {fix}", file=sys.stderr)
    print(fixed)
    return 0


def usage():
    print("usage:", file=sys.stderr)
    print("  python3 ru_regex_check.py '<key>' --lint [--kind name|word|phrase|auto] [--strategy regex|full-form|stem|auto]", file=sys.stderr)
    print("  python3 ru_regex_check.py '<regex>' --fix", file=sys.stderr)
    print("  python3 ru_regex_check.py '<regex>' --fix-strict-space", file=sys.stderr)
    print("  python3 ru_regex_check.py '<regex>' [--kind name|word|phrase|auto] 'слово1' 'слово2' ...", file=sys.stderr)


def main():
    if len(sys.argv) < 2:
        usage()
        return 2

    kind, args, kind_error = extract_option(sys.argv[2:], "kind", VALID_KINDS)
    if kind_error:
        print(f"ERROR {kind_error}", file=sys.stderr)
        return 2
    strategy, args, strategy_error = extract_option(args, "strategy", VALID_STRATEGIES)
    if strategy_error:
        print(f"ERROR {strategy_error}", file=sys.stderr)
        return 2

    if "--lint" in args:
        return lint_regex(sys.argv[1], kind=kind, strategy=strategy)

    if "--fix" in args or "--fix-strict-space" in args:
        return fix_regex(sys.argv[1], strict_space="--fix-strict-space" in args)

    candidates = [arg for arg in args if not arg.startswith("--")]
    if not candidates:
        usage()
        return 2

    try:
        regex = parse_regex(sys.argv[1])
    except re.error as error:
        print(f"ERROR regex syntax: {error}", file=sys.stderr)
        return 2

    ok = False
    for word in candidates:
        if not RU.search(word):
            print(f"SKIP non-ru: {word}")
            continue

        matched = regex.search(word) is not None
        ok = ok or matched
        print(f"{'OK' if matched else 'NO'}: {word}")

    return 0 if ok else 1


if __name__ == "__main__":
    raise SystemExit(main())
