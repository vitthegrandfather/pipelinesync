from app.services.csv_export import sanitize_csv_cell, to_csv


def test_formula_injection() -> None:
    assert sanitize_csv_cell("=HYPERLINK(1)") == "'=HYPERLINK(1)"
    assert sanitize_csv_cell("+cmd") == "'+cmd"
    assert sanitize_csv_cell("-2+3") == "'-2+3"
    assert sanitize_csv_cell("@SUM(1)") == "'@SUM(1)"
    assert to_csv(["name"], [["=1+1"]]) == "name\n'=1+1\n"
