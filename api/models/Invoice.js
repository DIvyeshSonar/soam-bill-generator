const mongoose = require('mongoose');

const InvoiceSchema = new mongoose.Schema({
  id: { type: Number, required: true }, // Local ID (Date.now())
  syncKey: { type: String, required: true, index: true },
  invoiceNo: String,
  date: String,
  customerName: String,
  customerEmail: String,
  items: Array,
  subtotal: Number,
  cgstRate: Number,
  sgstRate: Number,
  cgst: Number,
  sgst: Number,
  total: Number,
  received: Number,
  prevBalance: Number,
  terms: String,
  updatedAt: { type: Date, default: Date.now },
});

module.exports = mongoose.models.Invoice || mongoose.model('Invoice', InvoiceSchema);
