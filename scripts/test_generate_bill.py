"""
Unit tests for generate_bill.py following strict TDD (RED → GREEN per behavior).
Tests cover: exact totals with tax, Decimal rounding, empty-items, validation errors,
and workbook round-trip verification.
"""

import os
import sys
import tempfile
import unittest
from decimal import Decimal

# Add parent directory to path for imports
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from generate_bill import (
    compute_totals,
    validate_bill,
    generate_bill_workbook,
)


class TestComputeTotals(unittest.TestCase):
    """Tests for compute_totals function."""

    def setUp(self):
        """Set up common test data."""
        self.items = [
            {"name": "Web design", "quantity": 1, "unit_price": Decimal("1200.00")},
            {"name": "Hosting (monthly)", "quantity": 12, "unit_price": Decimal("9.99")},
        ]
        self.tax_rate = Decimal("8")  # 8%

    def test_exact_totals_with_tax(self):
        """Test 1: Exact totals with tax - subtotal 1319.88, tax 105.59, total 1425.47."""
        result = compute_totals(self.items, self.tax_rate)
        
        # Subtotal = 1*1200 + 12*9.99 = 1200 + 119.88 = 1319.88
        expected_subtotal = Decimal("1319.88")
        # Tax = 1319.88 * 0.08 = 105.5904 → rounded to 105.59
        expected_tax = Decimal("105.59")
        # Total = 1319.88 + 105.59 = 1425.47
        expected_total = Decimal("1425.47")
        
        self.assertEqual(result["subtotal"], expected_subtotal,
            f"Expected subtotal {expected_subtotal}, got {result['subtotal']}")
        self.assertEqual(result["tax"], expected_tax,
            f"Expected tax {expected_tax}, got {result['tax']}")
        self.assertEqual(result["total"], expected_total,
            f"Expected total {expected_total}, got {result['total']}")

    def test_decimal_rounding_no_float_artifacts(self):
        """Test 2: Decimal rounding - 3 × 0.1 @ 1.00 with tax 0 → subtotal 3.00."""
        items = [
            {"name": "Test item", "quantity": 3, "unit_price": Decimal("1.00")},
        ]
        result = compute_totals(items, Decimal("0"))
        
        # 3 × 0.1 = 0.30 exactly, not 0.30000000000000004
        self.assertEqual(result["subtotal"], Decimal("3.00"),
            "Decimal rounding failed: float artifacts detected")
        self.assertEqual(result["tax"], Decimal("0.00"),
            "Expected zero tax with 0% rate")
        self.assertEqual(result["total"], Decimal("3.00"),
            "Expected total equal to subtotal with 0% tax")


class TestEmptyItems(unittest.TestCase):
    """Tests for empty items list."""

    def test_empty_items_zero_totals(self):
        """Test 3: Empty items → subtotal/tax/total all Decimal('0.00')."""
        items = []
        result = compute_totals(items, Decimal("10"))  # 10% tax
        
        self.assertEqual(result["subtotal"], Decimal("0.00"),
            "Expected subtotal 0.00 for empty items")
        self.assertEqual(result["tax"], Decimal("0.00"),
            "Expected tax 0.00 for empty items")
        self.assertEqual(result["total"], Decimal("0.00"),
            "Expected total 0.00 for empty items")


class TestValidateBill(unittest.TestCase):
    """Tests for validate_bill function."""

    def test_missing_items_key(self):
        """Test 4a: Missing 'items' key raises ValueError."""
        data = {"bill_number": "B-001", "date": "2026-01-01", "customer": "Test"}
        
        with self.assertRaises(ValueError) as context:
            validate_bill(data)
        
        self.assertIn("missing 'items'", str(context.exception),
            f"Expected 'missing items' error, got: {context.exception}")

    def test_items_not_a_list(self):
        """Test 4b: Items not a list raises ValueError."""
        data = {"items": "not a list", "bill_number": "B-001"}
        
        with self.assertRaises(ValueError) as context:
            validate_bill(data)
        
        self.assertIn("'items' must be a list", str(context.exception),
            f"Expected list error, got: {context.exception}")

    def test_item_missing_name(self):
        """Test 4c: Item missing 'name' raises ValueError."""
        data = {
            "items": [{"quantity": 1, "unit_price": Decimal("10.00")}],
            "bill_number": "B-001",
        }
        
        with self.assertRaises(ValueError) as context:
            validate_bill(data)
        
        self.assertIn("missing 'name'", str(context.exception),
            f"Expected 'name' error, got: {context.exception}")

    def test_negative_quantity(self):
        """Test 4d: Negative quantity raises ValueError."""
        data = {
            "items": [{"name": "Item", "quantity": -1, "unit_price": Decimal("10.00")}],
            "bill_number": "B-001",
        }
        
        with self.assertRaises(ValueError) as context:
            validate_bill(data)
        
        self.assertIn("negative", str(context.exception),
            f"Expected negative quantity error, got: {context.exception}")

    def test_non_numeric_unit_price(self):
        """Test 4e: Non-numeric unit_price raises ValueError."""
        data = {
            "items": [{"name": "Item", "quantity": 1, "unit_price": "not a number"}],
            "bill_number": "B-001",
        }
        
        with self.assertRaises(ValueError) as context:
            validate_bill(data)
        
        self.assertIn("non-numeric", str(context.exception),
            f"Expected non-numeric error, got: {context.exception}")

    def test_negative_unit_price(self):
        """Test 4f: Negative unit_price raises ValueError."""
        data = {
            "items": [{"name": "Item", "quantity": 1, "unit_price": Decimal("-5.00")}],
            "bill_number": "B-001",
        }
        
        with self.assertRaises(ValueError) as context:
            validate_bill(data)
        
        self.assertIn("negative", str(context.exception),
            f"Expected negative unit_price error, got: {context.exception}")

    def test_valid_data_passes(self):
        """Test 4g: Valid data should not raise."""
        data = {
            "bill_number": "B-001",
            "date": "2026-01-01",
            "customer": "Test Customer",
            "currency": "$",
            "tax_rate": 10,
            "items": [{"name": "Item", "quantity": 1, "unit_price": Decimal("10.00")}],
        }
        
        validate_bill(data)  # Should not raise


class TestGenerateBillWorkbook(unittest.TestCase):
    """Tests for generate_bill_workbook function."""

    def setUp(self):
        """Set up test data."""
        self.data = {
            "bill_number": "B-2026-0001",
            "date": "2026-08-11",
            "customer": "Acme Corp",
            "currency": "$",
            "tax_rate": 8,
            "items": [
                {"name": "Web design", "quantity": 1, "unit_price": Decimal("1200.00")},
                {"name": "Hosting (monthly)", "quantity": 12, "unit_price": Decimal("9.99")},
            ],
        }
        self.expected_subtotal = Decimal("1319.88")
        self.expected_tax = Decimal("105.59")
        self.expected_total = Decimal("1425.47")

    def test_workbook_has_bill_sheet(self):
        """Test 5a: Workbook has 'Bill' sheet."""
        wb = generate_bill_workbook(self.data)
        
        self.assertIn("Bill", wb.sheetnames,
            f"Expected 'Bill' sheet, got {wb.sheetnames}")

    def test_workbook_contains_item_names(self):
        """Test 5b: Items table contains item names."""
        wb = generate_bill_workbook(self.data)
        ws = wb["Bill"]
        
        # Check that item names appear in the sheet
        sheet_content = []
        for r in range(1, ws.max_row + 1):
            for c in range(1, ws.max_column + 1):
                val = ws.cell(r, c).value
                if val is not None:
                    sheet_content.append(str(val))
        
        self.assertIn("Web design", sheet_content,
            f"Expected 'Web design' in sheet, got: {sheet_content}")
        self.assertIn("Hosting (monthly)", sheet_content,
            f"Expected 'Hosting (monthly)' in sheet, got: {sheet_content}")

    def test_workbook_total_cell_value(self):
        """Test 5c: Total cell value matches expected total."""
        wb = generate_bill_workbook(self.data)
        ws = wb["Bill"]
        
        # Debug: print row count
        self.assertEqual(ws.max_row, 9, f"Expected max_row 9, got {ws.max_row}")
        
        # Find the Total row (typically last row with 'Total' in it)
        total_row = None
        for r in range(1, ws.max_row + 1):
            val = ws.cell(r, 1).value
            if val and str(val).lower().startswith("total"):
                total_row = r
                break
        
        self.assertIsNotNone(total_row, f"Total row not found in rows 1-{ws.max_row}")
        
        # Total amount is in column D (index 4)
        total_cell = ws.cell(total_row, 4)
        self.assertEqual(total_cell.value, self.expected_total,
            f"Expected total {self.expected_total}, got {total_cell.value}")

    def test_workbook_round_trip_load(self):
        """Test 5d: Save workbook and reload - verify cells match."""
        with tempfile.NamedTemporaryFile(suffix=".xlsx", delete=False) as f:
            temp_path = f.name
        
        try:
            wb = generate_bill_workbook(self.data)
            wb.save(temp_path)
            
            # Reload and verify
            wb_reloaded = __import__('openpyxl').load_workbook(temp_path)
            ws_reloaded = wb_reloaded["Bill"]
            
            # Verify sheet exists
            self.assertIn("Bill", wb_reloaded.sheetnames)
            
            # Verify key cell values
            # Get row with Total label (first word of cell value)
            total_row = None
            for r in range(1, ws_reloaded.max_row + 1):
                val = ws_reloaded.cell(r, 1).value
                if val and str(val).lower().startswith("total"):
                    total_row = r
                    break
            
            self.assertIsNotNone(total_row)
            total_cell = ws_reloaded.cell(total_row, 4)
            
            # Compare as strings to avoid float/Decimal type issues
            total_str = str(total_cell.value)
            expected_str = str(self.expected_total)
            self.assertEqual(total_str, expected_str,
                f"Reloaded total {total_cell.value} != expected {self.expected_total}")
            
        finally:
            # Cleanup temp file
            if os.path.exists(temp_path):
                os.unlink(temp_path)


class TestIntegration(unittest.TestCase):
    """Integration tests combining multiple functions."""

    def test_full_workflow(self):
        """Test full workflow: validate → compute_totals → generate_bill_workbook."""
        data = {
            "bill_number": "B-2026-0001",
            "date": "2026-08-11",
            "customer": "Acme Corp",
            "currency": "$",
            "tax_rate": 8,
            "items": [
                {"name": "Web design", "quantity": 1, "unit_price": Decimal("1200.00")},
                {"name": "Hosting (monthly)", "quantity": 12, "unit_price": Decimal("9.99")},
            ],
        }
        
        # Validate
        validate_bill(data)
        
        # Compute totals
        totals = compute_totals(data["items"], Decimal(str(data["tax_rate"])))
        self.assertEqual(totals["subtotal"], Decimal("1319.88"))
        self.assertEqual(totals["total"], Decimal("1425.47"))
        
        # Generate workbook
        wb = generate_bill_workbook(data)
        self.assertIn("Bill", wb.sheetnames)


if __name__ == "__main__":
    unittest.main()
