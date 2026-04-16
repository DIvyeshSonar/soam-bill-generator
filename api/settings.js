const connectDB = require('./lib/db');
const Settings = require('./models/Settings');

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
        const settings = await Settings.findOne({ syncKey });
        if (settings) {
          res.status(200).json(settings);
        } else {
          res.status(404).json({ message: 'No settings found' });
        }
        break;

      case 'POST':
        const settingsData = req.body;
        const updated = await Settings.findOneAndUpdate(
          { syncKey },
          { ...settingsData, syncKey },
          { upsert: true, new: true }
        );
        res.status(200).json(updated);
        break;

      default:
        res.setHeader('Allow', ['GET', 'POST']);
        res.status(405).end(`Method ${method} Not Allowed`);
    }
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Server Error' });
  }
};
