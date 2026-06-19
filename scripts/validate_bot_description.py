#!/usr/bin/env python3
"""
validate_bot_description.py

Validates a SillyTavern character card description and first message.
Checks content quality, structure, macro usage, and writing style.

Usage:
    python3 validate_bot_description.py <path_to_character.json>

Exit codes:
    0 - Valid (warnings may exist)
    1 - Errors found
    2 - Invalid arguments or file access error
"""

import json
import os
import re
import sys
from dataclasses import dataclass, field
from typing import Any, Optional


# ─── Constants ────────────────────────────────────────────────────────────────

REQUIRED_SECTIONS = ["Character", "Appearance", "Mind", "Personality"]
RECOMMENDED_SECTIONS = ["Backstory", "Species", "Age", "Gender"]

MIN_DESC_LENGTH = 500
MAX_DESC_LENGTH = 5000
WARN_DESC_LENGTH = 3000
MAX_FIRST_MES_LENGTH = 2000

FIRST_PERSON_PATTERNS = [
    r"\bI am\b",
    r"\bI'm\b",
    r"\bI was\b",
    r"\bI've\b",
    r"\bI'd\b",
    r"\bmyself\b",
    r"\bЯ\s+[—–-]\s",
    r"\bЯ\s+есть\b",
    r"\bМеня\s+зовут\b",
    r"\bМне\s+\d+\s+лет\b",
]

NARRATIVE_HEADERS = [
    r"^#{1,3}\s+\w+",
    r"^\[\w+\]",
    r"^\*{1,2}\w+\*{1,2}\s*[\n:]",
]


# ─── Data Classes ─────────────────────────────────────────────────────────────

@dataclass
class Issue:
    severity: str  # "ERROR" or "WARN"
    field: Optional[str]
    message: str

    def format(self) -> str:
        fld = f"[{self.field}] " if self.field else ""
        return f"  [{self.severity}] {fld}{self.message}"


@dataclass
class Report:
    errors: list[Issue] = field(default_factory=list)
    warnings: list[Issue] = field(default_factory=list)
    info: list[str] = field(default_factory=list)

    def add_error(self, message: str, field: Optional[str] = None) -> None:
        self.errors.append(Issue("ERROR", field, message))

    def add_warning(self, message: str, field: Optional[str] = None) -> None:
        self.warnings.append(Issue("WARN", field, message))

    def add_info(self, message: str) -> None:
        self.info.append(message)

    def is_valid(self) -> bool:
        return len(self.errors) == 0

    def summary(self) -> str:
        parts = []
        parts.append(f"  Errors:   {len(self.errors)}")
        parts.append(f"  Warnings: {len(self.warnings)}")
        parts.append(f"  Info:     {len(self.info)}")
        return "\n".join(parts)

    def print_report(self) -> None:
        print()
        print("=" * 60)
        print("  Character Card Validation Report")
        print("=" * 60)

        for item in self.info:
            print(f"  [INFO] {item}")
        if self.info:
            print()

        for issue in self.errors:
            print(issue.format())
        if self.errors:
            print()

        for issue in self.warnings:
            print(issue.format())
        if self.warnings:
            print()

        print("-" * 60)
        print(self.summary())
        print("-" * 60)
        if self.is_valid():
            print("  Result:   PASS (no errors)")
        else:
            print("  Result:   FAIL")
        print("=" * 60)
        print()


# ─── Helpers ──────────────────────────────────────────────────────────────────


def check_file_access(filepath: str) -> Optional[str]:
    """Check if file exists and is readable. Return error message or None."""
    if not os.path.exists(filepath):
        return f"File not found: {filepath}"
    if not os.path.isfile(filepath):
        return f"Not a file: {filepath}"
    if not os.access(filepath, os.R_OK):
        return f"File not readable: {filepath}"
    return None


def parse_character_card(filepath: str, report: Report) -> Optional[dict]:
    """Parse the character card JSON and return data, or None on failure."""
    try:
        with open(filepath, "r", encoding="utf-8") as f:
            data = json.load(f)
    except json.JSONDecodeError as e:
        report.add_error(f"Invalid JSON: {e}", field="_file_")
        return None
    except UnicodeDecodeError as e:
        report.add_error(f"File encoding error: {e}", field="_file_")
        return None
    except OSError as e:
        report.add_error(f"Cannot read file: {e}", field="_file_")
        return None

    if not isinstance(data, dict):
        report.add_error(f"Root JSON must be an object, got {type(data).__name__}", field="_root_")
        return None

    return data


def detect_format(description: str) -> str:
    """
    Detect if the description uses structured Section() format,
    narrative format with headers, or plain text.
    Returns: "structured", "narrative", or "plain"
    """
    # Check for Section("Name", ...) pattern
    section_pattern = re.compile(r'\w+\s*\([^)]{3,}\)')
    section_matches = len(section_pattern.findall(description))

    if section_matches >= 3:
        return "structured"

    # Check for uppercase headers or markdown headers
    for pattern in NARRATIVE_HEADERS:
        if re.search(pattern, description, re.MULTILINE | re.IGNORECASE):
            return "narrative"

    # Check for obvious all-caps section headers
    if re.search(r'\n[A-Z][A-Z\s]{3,}[A-Z]\s*\n', description):
        return "narrative"

    return "plain"


def extract_structured_sections(description: str) -> list[str]:
    """Extract section names from structured format like Character(...)."""
    # Pattern: Word(  - captures the section name
    pattern = re.compile(r'\b(\w+)\s*\(', re.MULTILINE)
    sections = pattern.findall(description)
    # Filter out function-like calls that aren't sections
    valid_sections = [s for s in sections if s[0].isupper() and len(s) > 2]
    return valid_sections


def extract_narrative_sections(description: str) -> list[str]:
    """Extract section headers from narrative format."""
    headers = []
    # Markdown headers
    for match in re.finditer(r'^#{1,3}\s+(\w+)', description, re.MULTILINE):
        headers.append(match.group(1))
    # Bracket headers [Section]
    for match in re.finditer(r'^\[(\w+)\]', description, re.MULTILINE):
        headers.append(match.group(1))
    # ALL CAPS headers
    for match in re.finditer(r'\n([A-Z][A-Z\s]{3,}[A-Z])\s*\n', description):
        headers.append(match.group(1).strip())
    return headers


def check_first_person(description: str, report: Report) -> None:
    """Check if description is written in first person."""
    found_patterns = []
    for pattern in FIRST_PERSON_PATTERNS:
        if re.search(pattern, description, re.IGNORECASE):
            found_patterns.append(pattern)

    if found_patterns:
        report.add_warning(
            f"Description appears to be written in first person. "
            f"Matched patterns: {len(found_patterns)}. "
            f"SillyTavern descriptions should be in third person for best results. "
            f"Examples found: I am, I'm, etc.",
            field="description",
        )


def check_third_person(description: str, report: Report) -> None:
    """Check for third-person consistency markers."""
    third_person_indicators = [
        r"\b\w+\s+is\s+a\b",
        r"\b\w+\s+has\b",
        r"\b\w+\s+wears\b",
        r"\bShe\s+is\b",
        r"\bHe\s+is\b",
        r"\bThey\s+are\b",
    ]

    found = 0
    for pattern in third_person_indicators:
        if re.search(pattern, description, re.IGNORECASE):
            found += 1

    if found >= 2:
        report.add_info(
            f"Third-person writing detected ({found} indicators). Good!"
        )
    elif found == 0:
        report.add_warning(
            "No third-person indicators found. "
            "Description may not be in third person. "
            "Consider using phrases like '{{char}} is a...', 'She has...'",
            field="description",
        )


# ─── Validators ───────────────────────────────────────────────────────────────


def validate_description(data: dict, report: Report) -> None:
    """Validate the description field of a character card."""
    # Get description
    description = data.get("description", "")

    if not description:
        report.add_error(
            "Description is empty. Character cards MUST have a description. "
            "This is the primary source of character information.",
            field="description",
        )
        return

    if not isinstance(description, str):
        report.add_error(
            f"Description must be a string, got {type(description).__name__}",
            field="description",
        )
        return

    # 1. Not empty
    stripped = description.strip()
    report.add_info(f"Description length: {len(description)} characters")

    # 2. Length checks
    if len(stripped) < MIN_DESC_LENGTH:
        report.add_error(
            f"Description is too short: {len(stripped)} chars. "
            f"Minimum recommended: {MIN_DESC_LENGTH} chars. "
            f"Short descriptions produce shallow character responses.",
            field="description",
        )
    elif len(stripped) > MAX_DESC_LENGTH:
        report.add_error(
            f"Description is too long: {len(stripped)} chars. "
            f"Maximum recommended: {MAX_DESC_LENGTH} chars. "
            f"Long descriptions may be truncated by context limits.",
            field="description",
        )
    elif len(stripped) > WARN_DESC_LENGTH:
        report.add_warning(
            f"Description is quite long: {len(stripped)} chars. "
            f"Consider trimming to under {WARN_DESC_LENGTH} chars for better token efficiency.",
            field="description",
        )

    # 3. Contains {{char}} references
    char_name = data.get("name", "")
    has_char_macro = "{{char}}" in description
    has_char_name = bool(char_name) and char_name in description

    if has_char_macro:
        report.add_info("{{char}} macro found in description. Good!")
    elif has_char_name:
        report.add_warning(
            f"Description uses literal character name '{char_name}' instead of {{char}} macro. "
            f"Using {{char}} allows the character name to be changed in chats."
        )
    else:
        report.add_warning(
            "Description does not contain {{char}} macro or character name. "
            "This may cause the AI to not associate the description with the character.",
            field="description",
        )

    # 4. Contains {{user}} references
    has_user_macro = "{{user}}" in description
    if has_user_macro:
        report.add_info("{{user}} macro found in description. Good for interaction context!")
    else:
        report.add_warning(
            "Description does not contain {{user}} macro. "
            "Adding {{user}} references helps the character interact with the user.",
            field="description",
        )

    # 5 & 6. Format detection and section validation
    fmt = detect_format(description)
    report.add_info(f"Detected format: {fmt}")

    if fmt == "structured":
        sections_found = extract_structured_sections(description)
        report.add_info(f"Found sections: {sections_found}")

        # Check required sections
        for req in REQUIRED_SECTIONS:
            if req not in sections_found:
                report.add_error(
                    f"Missing required section: {req}(). "
                    f"This section is essential for character definition.",
                    field="description",
                )

        # Check recommended sections
        for rec in RECOMMENDED_SECTIONS:
            if rec not in sections_found:
                report.add_warning(
                    f"Recommended section missing: {rec}(). "
                    f"Adding this improves character depth.",
                    field="description",
                )

    elif fmt == "narrative":
        headers = extract_narrative_sections(description)
        report.add_info(f"Found narrative headers: {headers}")

        # Check for key topic coverage in headers or content
        topics_lower = description.lower()
        important_topics = {
            "appearance": "appearance" in topics_lower or "looks" in topics_lower,
            "personality": "personality" in topics_lower or "mind" in topics_lower,
            "character": "character" in topics_lower or "name" in topics_lower,
        }

        for topic, found in important_topics.items():
            if not found:
                report.add_warning(
                    f"Narrative format: no '{topic}' topic found in description. "
                    f"Consider adding a section about the character's {topic}.",
                    field="description",
                )

    else:  # plain
        report.add_warning(
            "Description appears to be in plain text format without clear section structure. "
            "Consider using structured [Section('...','...')] format or narrative headers "
            "for better organization and token efficiency.",
            field="description",
        )

    # 7. First-person check
    check_first_person(description, report)

    # 8. Third-person consistency
    check_third_person(description, report)

    # 9. {{char}} macro usage (detailed)
    char_macro_count = description.lower().count("{{char}}")
    if char_macro_count >= 3:
        report.add_info(f"{{char}} used {char_macro_count} times. Good coverage!")
    elif char_macro_count > 0:
        report.add_warning(
            f"{{char}} used only {char_macro_count} time(s). "
            f"Consider using it more to reinforce character identity.",
            field="description",
        )

    # Extra: check for common issues
    # Excessive repetition
    lines = [l.strip() for l in stripped.split("\n") if l.strip()]
    unique_lines = set(lines)
    if len(lines) > 10 and len(unique_lines) / len(lines) < 0.5:
        report.add_warning(
            "Description may have excessive repetition (many duplicate/similar lines). "
            "Consider condensing.",
            field="description",
        )


def validate_first_mes(data: dict, report: Report) -> None:
    """Validate the first_mes (greeting) field."""
    first_mes = data.get("first_mes", "")

    if not first_mes:
        report.add_error(
            "first_mes (greeting message) is empty. "
            "This is the first thing the character says - it MUST be set.",
            field="first_mes",
        )
        return

    if not isinstance(first_mes, str):
        report.add_error(
            f"first_mes must be a string, got {type(first_mes).__name__}",
            field="first_mes",
        )
        return

    report.add_info(f"first_mes length: {len(first_mes)} characters")

    # 10. Length warning
    if len(first_mes) > MAX_FIRST_MES_LENGTH:
        report.add_warning(
            f"first_mes is very long: {len(first_mes)} chars. "
            f"Consider keeping it under {MAX_FIRST_MES_LENGTH} chars. "
            f"The first message should be concise and engaging.",
            field="first_mes",
        )
    elif len(first_mes) < 20:
        report.add_warning(
            f"first_mes is very short: {len(first_mes)} chars. "
            f"A good greeting is typically 50-500 characters to set the scene.",
            field="first_mes",
        )
    else:
        report.add_info("first_mes length is in a good range.")

    # Check for {{char}} in first_mes
    if "{{char}}" in first_mes:
        report.add_warning(
            "first_mes contains {{char}} macro. "
            "The greeting should be written as the character speaking - "
            "the character name should NOT appear as a macro in their own speech.",
            field="first_mes",
        )

    # Check for {{user}} in first_mes (good practice)
    if "{{user}}" not in first_mes:
        report.add_warning(
            "first_mes does not reference {{user}}. "
            "The greeting should acknowledge the user to start the interaction.",
            field="first_mes",
        )
    else:
        report.add_info("first_mes references {{user}}. Good!")

    # Check first person in greeting (this is OK, but note it)
    first_person_found = False
    for pattern in FIRST_PERSON_PATTERNS:
        if re.search(pattern, first_mes, re.IGNORECASE):
            first_person_found = True
            break

    if first_person_found:
        report.add_info(
            "first_mes uses first-person perspective (correct for a greeting)."
        )


def validate_character_card(filepath: str) -> Report:
    """Main validation function. Returns a Report object."""
    report = Report()

    # 1. File access
    error = check_file_access(filepath)
    if error:
        report.add_error(error, field="_file_")
        return report

    report.add_info(f"File: {filepath}")
    report.add_info(f"Size: {os.path.getsize(filepath)} bytes")

    # 2. Parse JSON
    data = parse_character_card(filepath, report)
    if data is None:
        return report

    # 3. Check character name
    char_name = data.get("name", "")
    if char_name:
        report.add_info(f"Character name: '{char_name}'")
    else:
        report.add_warning(
            "Character 'name' is empty. Set a character name."
        )

    # 4. Validate description
    if "description" in data:
        validate_description(data, report)
    else:
        report.add_error(
            "Missing 'description' field entirely. This is REQUIRED.",
            field="description",
        )

    # 5. Validate first_mes
    if "first_mes" in data:
        validate_first_mes(data, report)
    else:
        report.add_error(
            "Missing 'first_mes' field entirely. This is REQUIRED.",
            field="first_mes",
        )

    # 6. Check alternate_greetings if present
    if "alternate_greetings" in data:
        alt = data["alternate_greetings"]
        if isinstance(alt, list):
            report.add_info(f"Alternate greetings: {len(alt)}")
            for i, g in enumerate(alt):
                if isinstance(g, str) and len(g) > MAX_FIRST_MES_LENGTH:
                    report.add_warning(
                        f"Alternate greeting [{i}] exceeds {MAX_FIRST_MES_LENGTH} chars: {len(g)}",
                        field="alternate_greetings",
                    )

    # 7. Check creator_notes if present
    if "creator_notes" in data:
        notes = data["creator_notes"]
        if isinstance(notes, str) and notes.strip():
            report.add_info("Creator notes present.")

    # 8. Check tags if present
    if "tags" in data:
        tags = data["tags"]
        if isinstance(tags, list):
            report.add_info(f"Tags: {tags}")
        elif isinstance(tags, str) and tags.strip():
            report.add_info(f"Tags (string): {tags}")

    return report


# ─── Main ─────────────────────────────────────────────────────────────────────


def main() -> int:
    if len(sys.argv) < 2:
        print(f"Usage: {sys.argv[0]} <path_to_character.json>", file=sys.stderr)
        print("", file=sys.stderr)
        print("Validates a SillyTavern character card description and first message.", file=sys.stderr)
        print("Exit codes: 0 = pass (warnings may exist), 1 = errors, 2 = arg/file error", file=sys.stderr)
        return 2

    filepath = sys.argv[1]
    report = validate_character_card(filepath)
    report.print_report()

    return 0 if report.is_valid() else 1


if __name__ == "__main__":
    sys.exit(main())
