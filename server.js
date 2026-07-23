require('dotenv').config();
const express = require('express');
const fs = require('fs');
const path = require('path');
const multer = require('multer');

// Persistent storage paths.
// On Railway, a volume is mounted at /data, which survives redeploys.
// Locally (Windows/Mac/no volume), /data won't exist or won't be writable,
// so we fall back to a local ./data folder instead.
function resolveDataDir() {
  const railwayPath = '/data';
  try {
    fs.accessSync(railwayPath, fs.constants.W_OK);
    return railwayPath;
  } catch {
    return path.join(__dirname, 'data');
  }
}
const DATA_DIR = resolveDataDir();
const REQUESTS_FILE = path.join(DATA_DIR, 'requests.json');
const UPLOADS_DIR = path.join(DATA_DIR, 'uploads');

// Ensure the data directory, uploads directory, and requests file all exist
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}
if (!fs.existsSync(REQUESTS_FILE)) {
  fs.writeFileSync(REQUESTS_FILE, JSON.stringify({
    rates: {
      studio: 40000,
      "1br": 55000,
      "2br": 70000,
      "3br": 90000,
    },
    addOnPrices: {
      laundry: 15000,
    },
    requests: [],
  }, null, 2));
}

// Multer setup — saves uploaded photos into the persistent volume, keeping the original extension
const storage = multer.diskStorage({
  destination: UPLOADS_DIR,
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  },
});
const upload = multer({ storage });

const app = express();
app.use(express.json());

// --- Simple password protection for admin routes ---
// IMPORTANT: this must be registered BEFORE express.static('public'),
// otherwise express.static will serve admin.html directly and this
// middleware will never run.
function requireAdminAuth(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Basic ')) {
    res.set('WWW-Authenticate', 'Basic realm="Admin"');
    return res.status(401).send('Authentication required');
  }

  const base64Credentials = authHeader.split(' ')[1];
  const credentials = Buffer.from(base64Credentials, 'base64').toString('utf-8');
  const [username, password] = credentials.split(':');

  if (password === process.env.ADMIN_PASSWORD) {
    return next();
  }

  res.set('WWW-Authenticate', 'Basic realm="Admin"');
  return res.status(401).send('Invalid credentials');
}

app.use('/admin.html', requireAdminAuth);
app.use('/requests', requireAdminAuth);

app.use(express.static('public'));
app.use('/uploads', express.static(UPLOADS_DIR));

// --- Routes ---

// Create a new cleaning request
app.post('/request', (req, res) => {
  try {
    const db = JSON.parse(fs.readFileSync(REQUESTS_FILE, 'utf-8'));

    const {
      propertyAddress,
      propertyType,
      hostName,
      hostEmail,
      hostWhatsapp,
      neighborhood,
      buildingApt,
      checkoutTime,
      nextCheckinTime,
      specialInstructions,
      laundry,
    } = req.body;

    const basePrice = db.rates[propertyType];
    if (basePrice === undefined) {
      return res.status(400).json({ error: 'Invalid property type' });
    }

    const addOns = [];
    if (laundry) {
      addOns.push({ name: 'Laundry (wash & fold)', price: db.addOnPrices.laundry });
    }
    const totalPrice = basePrice + addOns.reduce((sum, a) => sum + a.price, 0);

    const nextId = db.requests.length > 0
      ? Math.max(...db.requests.map(r => r.id)) + 1
      : 1;

    const newRequest = {
      id: nextId,
      propertyAddress,
      propertyType,
      hostName,
      hostEmail,
      hostWhatsapp,
      neighborhood,
      buildingApt,
      checkoutTime,
      nextCheckinTime,
      specialInstructions,
      basePrice,
      addOns,
      totalPrice,
      assignedCleaner: null,
      status: 'requested',
      photoUrl: null,
      createdAt: new Date().toISOString(),
    };

    db.requests.push(newRequest);
    fs.writeFileSync(REQUESTS_FILE, JSON.stringify(db, null, 2));

    res.json({ totalPrice, id: newRequest.id });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Something went wrong' });
  }
});

// List all requests (for admin view)
app.get('/requests', (req, res) => {
  try {
    const db = JSON.parse(fs.readFileSync(REQUESTS_FILE, 'utf-8'));
    res.json(db.requests);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Something went wrong' });
  }
});

// Update status or assigned cleaner
app.put('/requests/:id', (req, res) => {
  try {
    const db = JSON.parse(fs.readFileSync(REQUESTS_FILE, 'utf-8'));
    const request = db.requests.find(r => r.id === parseInt(req.params.id, 10));

    if (!request) {
      return res.status(404).json({ error: 'Request not found' });
    }

    const { assignedCleaner, status } = req.body;
    if (assignedCleaner !== undefined) request.assignedCleaner = assignedCleaner;
    if (status !== undefined) request.status = status;

    fs.writeFileSync(REQUESTS_FILE, JSON.stringify(db, null, 2));
    res.json(request);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Something went wrong' });
  }
});

// Upload a completion photo for a request
app.post('/requests/:id/photo', upload.single('photo'), (req, res) => {
  try {
    const db = JSON.parse(fs.readFileSync(REQUESTS_FILE, 'utf-8'));
    const request = db.requests.find(r => r.id === parseInt(req.params.id, 10));

    if (!request) {
      return res.status(404).json({ error: 'Request not found' });
    }

    request.photoUrl = '/uploads/' + req.file.filename;
    fs.writeFileSync(REQUESTS_FILE, JSON.stringify(db, null, 2));

    res.json({ photoUrl: request.photoUrl });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Something went wrong' });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));