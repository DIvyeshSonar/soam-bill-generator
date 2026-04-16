const mongoose = require('mongoose');

const SettingsSchema = new mongoose.Schema({
  syncKey: { type: String, required: true, unique: true },
  name: String,
  email: String,
  mobile: String,
  signature: String,
  updatedAt: { type: Date, default: Date.now },
});

module.exports = mongoose.models.Settings || mongoose.model('Settings', SettingsSchema);
