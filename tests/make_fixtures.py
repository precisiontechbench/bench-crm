"""Builds the small receipt PDFs the Playwright test scans. Run: python3 make_fixtures.py"""
import io, random
from reportlab.lib.pagesizes import letter
from reportlab.pdfgen import canvas
from reportlab.lib.utils import ImageReader
from PIL import Image, ImageDraw, ImageFilter

OUT = 'fixtures/'

def receipt(c, marker, vendor, addr, date, items, tax_rate=0.06, extra=''):
    c.setFont('Helvetica-Bold', 20); c.drawString(72, 700, vendor)
    c.setFont('Helvetica', 10); c.drawString(72, 684, addr); c.drawString(72, 672, 'Date: ' + date)
    c.drawString(72, 660, extra or 'Thank you for your business')
    y = 630; sub = 0
    c.setFont('Helvetica', 11)
    for name, qty, price in items:
        c.drawString(72, y, name); c.drawString(380, y, str(qty)); c.drawRightString(540, y, '%.2f' % (qty * price)); sub += qty * price; y -= 18
    tax = round(sub * tax_rate, 2)
    y -= 10; c.drawString(380, y, 'Subtotal'); c.drawRightString(540, y, '%.2f' % sub)
    y -= 16; c.drawString(380, y, 'Sales tax'); c.drawRightString(540, y, '%.2f' % tax)
    y -= 18; c.setFont('Helvetica-Bold', 12); c.drawString(380, y, 'TOTAL'); c.drawRightString(540, y, '%.2f' % (sub + tax))
    c.setFont('Helvetica', 6); c.setFillGray(0.85); c.drawString(72, 40, 'FIXTURE:' + marker); c.setFillGray(0)
    c.showPage()

def build(name, pages):
    buf = io.BytesIO(); c = canvas.Canvas(buf, pagesize=letter, pageCompression=0)
    for p in pages: receipt(c, *p)
    c.save(); open(OUT + name, 'wb').write(buf.getvalue())

build('homedepot.pdf', [('homedepot', 'THE HOME DEPOT #1234', '2100 Main St, Carrollton KY', '2026-10-03',
    [('Cat6 cable 100ft', 2, 24.98), ('Wall plate', 4, 2.47), ('Zip ties', 1, 7.99)])])
# same purchase, different file bytes: must be caught by vendor + date + total, not by file hash
build('homedepot-copy.pdf', [('homedepot-copy', 'THE HOME DEPOT #1234', '2100 Main St, Carrollton KY', '2026-10-03',
    [('Cat6 cable 100ft', 2, 24.98), ('Wall plate', 4, 2.47), ('Zip ties', 1, 7.99)], 0.06, 'Customer copy')])
build('homedepot-later.pdf', [('homedepot-later', 'THE HOME DEPOT #1234', '2100 Main St, Carrollton KY', '2026-10-09',
    [('Thermal paste', 1, 9.99)])])
build('newegg.pdf', [('newegg', 'Newegg Inc.', '17560 Rowland St, City of Industry CA', '2026-10-05',
    [('Samsung 1TB SSD', 1, 79.99), ('SATA cable', 2, 5.49)], 0.0)])
build('coffee-multi.pdf', [
    ('coffee1', 'Restaurant Depot', '100 Wholesale Way, Cincinnati OH', '2026-10-02', [('Whole bean coffee 5lb', 6, 31.5), ('Paper cups 1000ct', 2, 41.0)], 0.0),
    ('coffee2', 'Chick-fil-A', '55 Market St, Carrollton KY', '2026-10-04', [('Lunch with supplier', 1, 38.4)], 0.06)])

# an image-only page: a skewed, noisy "scan" with no text layer
random.seed(4)
img = Image.new('L', (850, 1100), 238); d = ImageDraw.Draw(img)
d.text((80, 90), 'Mac Tools - Carrollton', fill=60); d.text((80, 130), 'illegible handwritten total', fill=90)
for i in range(7): d.text((80, 200 + i * 28), 'item %d ......................... %d.%02d' % (i, i + 3, random.randint(0, 99)), fill=110)
d.text((80, 520), 'FIXTURE:blurry', fill=200)
img = img.rotate(2.5, fillcolor=238).filter(ImageFilter.GaussianBlur(2.2))
for _ in range(9000): img.putpixel((random.randrange(850), random.randrange(1100)), random.randrange(120, 255))
buf = io.BytesIO(); c = canvas.Canvas(buf, pagesize=letter, pageCompression=0)
c.drawImage(ImageReader(img), 0, 0, width=612, height=792); c.showPage(); c.save()
open(OUT + 'blurry-scan.pdf', 'wb').write(buf.getvalue())

# ---- invoice fixtures (QuickBooks-style) for tests/invoices.test.js ----
def invoice(c, marker, number, customer, date, items, paid=True, tax_rate=0.06, note=''):
    c.setFont('Helvetica-Bold', 20); c.drawString(72, 710, 'Precision Tech Bench')
    c.setFont('Helvetica-Bold', 14); c.drawString(400, 710, 'INVOICE ' + number)
    c.setFont('Helvetica', 10); c.drawString(72, 690, 'Bill to: ' + customer); c.drawString(72, 676, 'Invoice date: ' + date)
    if note: c.drawString(72, 662, note)
    y = 630; sub = 0; c.setFont('Helvetica', 11)
    for name, qty, price in items:
        c.drawString(72, y, name); c.drawString(380, y, str(qty)); c.drawRightString(540, y, '%.2f' % (qty * price)); sub += qty * price; y -= 18
    tax = round(sub * tax_rate, 2); total = round(sub + tax, 2)
    y -= 10; c.drawString(380, y, 'Subtotal'); c.drawRightString(540, y, '%.2f' % sub)
    y -= 16; c.drawString(380, y, 'Sales tax'); c.drawRightString(540, y, '%.2f' % tax)
    y -= 18; c.setFont('Helvetica-Bold', 12); c.drawString(380, y, 'TOTAL'); c.drawRightString(540, y, '%.2f' % total)
    y -= 18; c.drawString(380, y, 'Balance due'); c.drawRightString(540, y, '0.00' if paid else '%.2f' % total)
    if paid: c.setFont('Helvetica-Bold', 28); c.drawString(72, 300, 'PAID')
    c.setFont('Helvetica', 6); c.setFillGray(0.85); c.drawString(72, 40, 'FIXTURE:' + marker); c.setFillGray(0)
    c.showPage()

def build_inv(name, pages):
    buf = io.BytesIO(); c = canvas.Canvas(buf, pagesize=letter, pageCompression=0)
    for p in pages: invoice(c, *p)
    c.save(); open(OUT + name, 'wb').write(buf.getvalue())

JANE = [('Malware removal and cleanup', 1, 95.0), ('Windows tune-up', 1, 35.0)]
build_inv('inv-paid.pdf', [('inv-paid', '1001', 'Jane Doe', '2026-03-10', JANE)])
build_inv('inv-paid-existing.pdf', [('inv-paid-existing', '1002', 'JANE DOE', '2026-04-02', [('SSD install', 1, 60.0)])])
build_inv('inv-unpaid.pdf', [('inv-unpaid', '1003', 'Bob Builder', '2026-09-20', [('Data recovery', 1, 250.0)], False)])
build_inv('inv-dup-number.pdf', [('inv-dup-number', '1001', 'Jane Doe', '2026-03-10', JANE, True, 0.06, 'Customer copy')])
build_inv('inv-near-customer.pdf', [('inv-near', '1004', 'Jane M Doe', '2026-05-05', [('Router setup', 1, 80.0)])])
build_inv('inv-multi.pdf', [
    ('inv-multi-1', '1005', 'Carroll Diner', '2026-06-01', [('Network cabling', 2, 120.0)], True, 0.0),
    ('inv-multi-2', '1006', 'Carroll Diner', '2026-06-15', [('POS troubleshooting', 1, 150.0)], True, 0.06)])

print('ok')
