"""Harmless demo script for Phase 6 e2e verification.

Prints a line to stdout and a warning to stderr, then exits 0.
"""
import sys

print("phase6-e2e stdout marker")
print("phase6-e2e stderr warning", file=sys.stderr)
sys.exit(0)
