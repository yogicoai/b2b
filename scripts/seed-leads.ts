import mongoose from 'mongoose';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import { Lead } from '../src/models/Lead';

dotenv.config({ path: '.env.local' });

// We simulate the browser environment to parse the raw JS files
const context: any = {};
const fakeWindow = { CRM_LEADS: [] };

function evaluateFile(filePath: string) {
  if (!fs.existsSync(filePath)) return;
  const content = fs.readFileSync(filePath, 'utf-8');
  // Simple evaluation to capture window.CRM_LEADS assignments
  const wrappedCode = `
    (function(window) {
      ${content}
    })(arguments[0]);
  `;
  try {
    const fn = new Function(wrappedCode);
    fn(fakeWindow);
  } catch(e) {
    console.error(`Error parsing ${filePath}:`, e);
  }
}

async function seedLeads() {
  const MONGODB_URI = process.env.MONGODB_URI;
  if (!MONGODB_URI) throw new Error('MONGODB_URI not set');

  await mongoose.connect(MONGODB_URI);
  console.log('Connected to MongoDB');

  // Load all assets/data.js files (moved to public/assets)
  const assetsDir = path.join(__dirname, '../public/assets');
  evaluateFile(path.join(assetsDir, 'data.js'));
  evaluateFile(path.join(assetsDir, 'uk-japan-extra-leads.js'));
  evaluateFile(path.join(assetsDir, 'israel-extra-leads.js'));
  evaluateFile(path.join(assetsDir, 'middleeast-extra-leads.js'));
  evaluateFile(path.join(assetsDir, 'global-extra-leads.js'));

  const leads = fakeWindow.CRM_LEADS || [];
  console.log(`Found ${leads.length} leads in assets files.`);

  // Create unique ID logic (same as app.js)
  const makeId = (lead: any, i: number) => {
    return String(lead.Company).substring(0, 5).replace(/[^a-z0-9]/gi, '').toLowerCase() + 
           '-' + String(lead.Region).substring(0, 3).toLowerCase() + '-' + i;
  };

  const formattedLeads = leads.map((lead: any, index: number) => {
    // inferInitialStatus logic
    let status = "New";
    const app = String(lead.Approach || "").toLowerCase();
    if (app.includes("linkedin") || app.includes("direct message") || app.includes("email sent")) {
      status = "Contacted";
    }
    if (String(lead.Confidence || "").toLowerCase().includes("high")) {
      status = "Qualified";
    }

    return {
      leadId: makeId(lead, index),
      status: status,
      ...lead
    };
  });

  await Lead.deleteMany({});
  console.log('Cleared existing leads.');
  
  await Lead.insertMany(formattedLeads);
  console.log(`✅ Seeded ${formattedLeads.length} leads into MongoDB.`);

  await mongoose.disconnect();
}

seedLeads().catch(console.error);
