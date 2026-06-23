#!/usr/bin/env python3
"""
validate_lorebook_json.py

Validates a SillyTavern lorebook JSON file (character_book format).
Checks structure, required fields, data types, and consistency.

Usage:
    python3 validate_lorebook_json.py <path_to_lorebook.json>

Exit codes:
    0 - Valid lorebook
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

VALID_POSITIONS = [
    "before_char",
    "after_char",
    "before_example",
    "after_example",
    "author_note",
    "at_depth",
]

MIN_ORDER = 0
MAX_ORDER = 1000


# ─── Data Classes ─────────────────────────────────────────────────────────────

@dataclass
class Issue:
    severity: str  # "ERROR" or "WARN"
    entry_id: Optional[int]
    field: Optional[str]
    message: str

    def format(self) -> str:
        loc = f"[entry id={self.entry_id}]" if self.entry_id is not None else "[root]"
        fld = f" .{self.field}" if self.field else ""
        return f"  [{self.severity}] {loc}{fld}: {self.message}"


@dataclass
class Report:
    errors: list[Issue] = field(default_factory=list)
    warnings: list[Issue] = field(default_factory=list)
    info: list[str] = field(default_factory=list)

    def add_error(self, message: str, entry_id: Optional[int] = None, field: Optional[str] = None) -> None:
        self.errors.append(Issue("ERROR", entry_id, field, message))

    def add_warning(self, message: str, entry_id: Optional[int] = None, field: Optional[str] = None) -> None:
        self.warnings.append(Issue("WARN", entry_id, field, message))

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
        print("  Lorebook Validation Report")
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
            print("  Result:   VALID")
        else:
            print("  Result:   INVALID")
        print("=" * 60)
        print()


# ─── Validators ───────────────────────────────────────────────────────────────


def check_file_access(filepath: str) -> Optional[str]:
    """Check if file exists and is readable. Return error message or None."""
    if not os.path.exists(filepath):
        return f"File not found: {filepath}"
    if not os.path.isfile(filepath):
        return f"Not a file: {filepath}"
    if not os.access(filepath, os.R_OK):
        return f"File not readable: {filepath}"
    return None


def validate_json_structure(raw_text: str, report: Report) -> Optional[dict]:
    """Parse JSON and return data dict, or None and add errors to report."""
    try:
        data = json.loads(raw_text)
    except json.JSONDecodeError as e:
        report.add_error(f"Invalid JSON: {e}")
        return None
    except UnicodeDecodeError as e:
        report.add_error(f"File encoding error (expected UTF-8): {e}")
        return None

    if not isinstance(data, dict):
        report.add_error(f"Root JSON value must be an object (dict), got {type(data).__name__}")
        return None

    return data


def validate_top_level(data: dict, report: Report) -> None:
    """Validate top-level keys of the lorebook."""
    # Check 'entries'
    if "entries" not in data:
        report.add_error("Missing required top-level key: 'entries'")
    elif not isinstance(data["entries"], list):
        report.add_error(
            f"'entries' must be an array, got {type(data['entries']).__name__}"
        )

    # Check 'name'
    if "name" not in data:
        report.add_error("Missing required top-level key: 'name'")
    elif not isinstance(data["name"], str):
        report.add_error(
            f"'name' must be a string, got {type(data['name']).__name__}"
        )
    elif not data["name"].strip():
        report.add_warning("'name' is empty or whitespace only")
    else:
        report.add_info(f"Lorebook name: '{data['name']}'")


def validate_entry(entry: dict, entry_index: int, report: Report) -> Optional[int]:
    """
    Validate a single lorebook entry.
    Returns the entry's 'id' value, or None if it doesn't have a valid one.
    """
    entry_id = entry.get("id", f"<index_{entry_index}>")

    # --- Required fields ---
    required_fields = {
        "id": int,
        "keys": list,
        "content": str,
        "comment": str,
    }

    for field_name, expected_type in required_fields.items():
        if field_name not in entry:
            report.add_error(
                f"Missing required field '{field_name}'",
                entry_id=entry_id,
                field=field_name,
            )
            continue
        if not isinstance(entry[field_name], expected_type):
            report.add_error(
                f"'{field_name}' must be {expected_type.__name__}, got {type(entry[field_name]).__name__}: {entry[field_name]!r}",
                entry_id=entry_id,
                field=field_name,
            )

    # Helper to safely check if field exists and is correct type
    def has_field(name: str, expected_type: type) -> bool:
        if name not in entry:
            return False
        if not isinstance(entry[name], expected_type):
            return False
        return True

    # --- id uniqueness will be checked later; just ensure it's int ---
    actual_id = entry.get("id")
    if not isinstance(actual_id, int):
        actual_id = None  # Can't use for further checks

    # --- keys array ---
    if has_field("keys", list):
        if len(entry["keys"]) == 0:
            report.add_warning(
                "'keys' array is empty - entry will never trigger",
                entry_id=entry_id,
                field="keys",
            )
        else:
            for ki, key in enumerate(entry["keys"]):
                if not isinstance(key, str):
                    report.add_error(
                        f"Key at index {ki} is not a string: {key!r}",
                        entry_id=entry_id,
                        field="keys",
                    )

        # Regex validation
        if entry.get("use_regex") is True:
            for ki, key in enumerate(entry["keys"]):
                if isinstance(key, str) and not key.startswith("/"):
                    report.add_warning(
                        f"Regex key '{key}' at index {ki} does not start with '/'. "
                        f"SillyTavern regex keys conventionally start with '/'.",
                        entry_id=entry_id,
                        field="keys",
                    )

    # --- secondary_keys ---
    if has_field("secondary_keys", list):
        if len(entry["secondary_keys"]) == 0 and entry.get("selective") is True:
            report.add_warning(
                "'selective' is true but 'secondary_keys' is empty",
                entry_id=entry_id,
                field="secondary_keys",
            )

    # --- content ---
    if has_field("content", str):
        content = entry["content"].strip()
        if not content:
            report.add_error(
                "'content' is empty or whitespace only",
                entry_id=entry_id,
                field="content",
            )
        elif len(content) < 10:
            report.add_warning(
                f"'content' is very short ({len(content)} chars): {content[:50]!r}",
                entry_id=entry_id,
                field="content",
            )

    # --- position ---
    if has_field("position", str):
        if entry["position"] not in VALID_POSITIONS:
            report.add_error(
                f"Invalid 'position': '{entry['position']}'. "
                f"Must be one of: {', '.join(VALID_POSITIONS)}",
                entry_id=entry_id,
                field="position",
            )
    elif "position" not in entry:
        report.add_warning(
            "Missing 'position' field - will use default",
            entry_id=entry_id,
            field="position",
        )

    # --- constant ---
    if has_field("constant", bool):
        if entry["constant"] is True and entry.get("insertion_order", 0) > 100:
            report.add_info(
                f"Entry is constant with insertion_order={entry.get('insertion_order')} "
                f"(constant entries are always inserted)"
            )
    elif "constant" in entry:
        report.add_error(
            f"'constant' must be boolean, got {type(entry['constant']).__name__}",
            entry_id=entry_id,
            field="constant",
        )

    # --- insertion_order ---
    if has_field("insertion_order", int):
        order = entry["insertion_order"]
        if order < MIN_ORDER or order > MAX_ORDER:
            report.add_error(
                f"'insertion_order' must be between {MIN_ORDER} and {MAX_ORDER}, got {order}",
                entry_id=entry_id,
                field="insertion_order",
            )
    elif "insertion_order" in entry:
        report.add_error(
            f"'insertion_order' must be int, got {type(entry['insertion_order']).__name__}",
            entry_id=entry_id,
            field="insertion_order",
        )

    # --- enabled ---
    if has_field("enabled", bool):
        if entry["enabled"] is False:
            report.add_warning(
                "Entry is disabled (enabled: false)",
                entry_id=entry_id,
                field="enabled",
            )
    elif "enabled" in entry:
        report.add_error(
            f"'enabled' must be boolean, got {type(entry['enabled']).__name__}",
            entry_id=entry_id,
            field="enabled",
        )

    # --- use_regex ---
    if "use_regex" in entry and not isinstance(entry["use_regex"], bool):
        report.add_error(
            f"'use_regex' must be boolean, got {type(entry['use_regex']).__name__}",
            entry_id=entry_id,
            field="use_regex",
        )

    # --- comment ---
    if has_field("comment", str):
        comment = entry["comment"].strip()
        if not comment:
            report.add_warning(
                "'comment' is empty - consider adding a descriptive comment",
                entry_id=entry_id,
                field="comment",
            )

    return actual_id


def check_duplicate_ids(entry_ids: list[int], report: Report) -> None:
    """Check for duplicate entry IDs."""
    seen = set()
    duplicates = set()
    for eid in entry_ids:
        if eid in seen:
            duplicates.add(eid)
        seen.add(eid)

    for dup_id in sorted(duplicates):
        # Count how many times this ID appears
        count = entry_ids.count(dup_id)
        report.add_error(
            f"Duplicate entry 'id' value: {dup_id} (appears {count} times)"
        )


def validate_lorebook(filepath: str) -> Report:
    """Main validation function. Returns a Report object."""
    report = Report()

    # 1. File access
    error = check_file_access(filepath)
    if error:
        report.add_error(error)
        return report

    report.add_info(f"File: {filepath}")
    report.add_info(f"Size: {os.path.getsize(filepath)} bytes")

    # 2. Read and parse
    try:
        with open(filepath, "r", encoding="utf-8") as f:
            raw_text = f.read()
    except OSError as e:
        report.add_error(f"Cannot read file: {e}")
        return report

    data = validate_json_structure(raw_text, report)
    if data is None:
        return report

    # 3. Top-level validation
    validate_top_level(data, report)

    # 4. Entries validation
    entries = data.get("entries", [])
    if isinstance(entries, list):
        report.add_info(f"Entries found: {len(entries)}")

        if len(entries) == 0:
            report.add_warning("'entries' array is empty - lorebook has no content")

        entry_ids: list[int] = []

        for idx, entry in enumerate(entries):
            if not isinstance(entry, dict):
                report.add_error(
                    f"Entry at index {idx} is not an object: {type(entry).__name__}"
                )
                continue
            eid = validate_entry(entry, idx, report)
            if eid is not None:
                entry_ids.append(eid)

        # 5. Check for duplicate IDs
        if entry_ids:
            check_duplicate_ids(entry_ids, report)

        # 6. Check ID sequence
        if entry_ids and len(entry_ids) == len(entries):
            expected = list(range(len(entries)))
            if sorted(entry_ids) != expected:
                missing = sorted(set(expected) - set(entry_ids))
                if missing:
                    report.add_warning(f"Missing ID values in sequence: {missing}")

    return report


# ─── Main ─────────────────────────────────────────────────────────────────────


def main() -> int:
    if len(sys.argv) < 2:
        print(f"Usage: {sys.argv[0]} <path_to_lorebook.json>", file=sys.stderr)
        print("", file=sys.stderr)
        print("Validates a SillyTavern lorebook JSON file.", file=sys.stderr)
        print("Exit codes: 0 = valid, 1 = errors found, 2 = argument/file error", file=sys.stderr)
        return 2

    filepath = sys.argv[1]
    report = validate_lorebook(filepath)
    report.print_report()

    return 0 if report.is_valid() else 1


if __name__ == "__main__":
    sys.exit(main())
