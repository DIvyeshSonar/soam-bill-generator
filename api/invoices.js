const connectDB = require('./lib/db');
const Invoice = require('./models/Invoice');

module.exports = async (req, res) => {
  await connectDB();
  const syncKey = req.headers['x-sync-key'];

  if (!syncKey) {
    return res.status(401).json({ error: 'Sync Key required' });
  }

  const { method } = req;

  try {
    switch (method) {
      case 'GET':
        const invoices = await Invoice.find({ syncKey }).sort({ id: -1 });
        res.status(200).json(invoices);
        break;

      case 'POST':
        const invoiceData = req.body;
        // Check if invoice already exists to update it
        const existing = await Invoice.findOne({ syncKey, id: invoiceData.id });
        if (existing) {
          Object.assign(existing, invoiceData);
          existing.updatedAt = Date.now();
          await existing.save();
          res.status(200).json(existing);
        } else {
          const newInvoice = new Invoice({ ...invoiceData, syncKey });
          await newInvoice.save();
          res.status(201).json(newInvoice);
        }
        break;

      case 'DELETE':
        const { id } = req.query;
        if (id) {
          await Invoice.deleteOne({ syncKey, id: parseInt(id) });
          res.status(200).json({ success: true });
        } else {
          res.status(400).json({ error: 'Invoice ID required' });
        }
        break;

      default:
        res.setHeader('Allow', ['GET', 'POST', 'DELETE']);
        res.status(405).end(`Method ${method} Not Allowed`);
    }
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Server Error' });
  }
};
