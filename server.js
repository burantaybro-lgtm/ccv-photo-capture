require("dotenv").config();

const express = require("express");
const multer = require("multer");
const cors = require("cors");
const path = require("path");
const fs = require("fs");
const { Dropbox } = require("dropbox");

const app = express();

async function getDropboxAccessToken() {
  const response = await fetch("https://api.dropboxapi.com/oauth2/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: process.env.DROPBOX_REFRESH_TOKEN,
      client_id: process.env.DROPBOX_CLIENT_ID,
      client_secret: process.env.DROPBOX_CLIENT_SECRET
    })
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error("Dropbox token refresh failed: " + JSON.stringify(data));
  }

  return data.access_token;
}

if (!fs.existsSync("uploads")) {
  fs.mkdirSync("uploads");
}

app.use(cors());
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "mobile.html"));
});

app.use(express.static("public"));

const storage = multer.diskStorage({
  destination: "uploads/",
  filename: (req, file, cb) => {
    cb(null, Date.now() + path.extname(file.originalname));
  }
});

const upload = multer({ storage });

const stores = {
  "palmerston-north": {
    name: "Palmerston North",
    password: "7605",
    dropboxFolder: "Palmerston North"
  },

  "new-plymouth": {
    name: "New Plymouth",
    password: "0137",
    dropboxFolder: "New Plymouth"
  },

  "wanganui": {
    name: "Wanganui",
    password: "9999",
    dropboxFolder: "Wanganui"
  },

  "hamilton-central": {
    name: "Hamilton Central",
    password: "6767",
    dropboxFolder: "Hamilton Central"
  },

  "hamilton-east": {
    name: "Hamilton East",
    password: "2323",
    dropboxFolder: "Hamilton East"
  }
};

app.post("/mobile-upload", upload.array("photos", 20), async (req, res) => {
  try {
    const stockCode = req.body.stockCode;

const photoType = req.body.photoType || "Floorstock";
const safePhotoType = photoType.replace(/[<>:"/\\|?*]/g, "");

const storeId = req.body.storeId;
const storePassword = req.body.storePassword;

const store = stores[storeId];

if (!store || store.password !== storePassword) {
  return res.status(403).json({
    success: false,
    error: "Invalid store login"
  });
}

    if (!stockCode) {
      return res.status(400).json({
        success: false,
        error: "Missing stock code"
      });
    }

    if (!req.files || req.files.length === 0) {
      return res.status(400).json({
        success: false,
        error: "No photos uploaded"
      });
    }

    const dateFolder = new Date().toLocaleDateString("en-NZ", {
  timeZone: "Pacific/Auckland",
  year: "numeric",
  month: "2-digit",
  day: "2-digit"
}).split("/").reverse().join("-");

const storeUploadFolder = path.join(
  "uploads",
  storeId,
  dateFolder,
  safePhotoType
);

    if (!fs.existsSync(storeUploadFolder)) {
      fs.mkdirSync(storeUploadFolder, { recursive: true });
    }

    const savedFiles = [];

    for (const file of req.files) {
      const extension = path.extname(file.originalname) || ".JPG";

      let counter = 1;
      let newFileName;

do {
  newFileName = `${stockCode} (${counter})${extension}`;
  counter++;
} while (
  fs.existsSync(path.join(storeUploadFolder, newFileName))
);

      const oldPath = file.path;
      const newPath = path.join(storeUploadFolder, newFileName);

      fs.renameSync(oldPath, newPath);

      const fileContent = fs.readFileSync(newPath);

  if (process.env.DROPBOX_REFRESH_TOKEN) {

    const accessToken = await getDropboxAccessToken();

    console.log("Dropbox token generated");

    const dbxUpload = new Dropbox({
      accessToken
    });

    const dropboxResult = await dbxUpload.filesUpload({
      path: `/Trademe Uploads/${store.name}/${dateFolder}/${safePhotoType}/${newFileName}`,
      contents: fileContent,
      mode: "add"
    });

    console.log(
      "DROPBOX UPLOAD RESULT:",
      dropboxResult.result.path_display
    );

    console.log(JSON.stringify(dropboxResult, null, 2));

    console.log(
      "Uploaded to Dropbox:",
      `/Trademe Uploads/${store.name}/${dateFolder}/${safePhotoType}/${newFileName}`
    );
  }

// Delete the temporary local file now that Dropbox has it
fs.unlinkSync(newPath);

      savedFiles.push(newFileName);
    }

    res.json({
      success: true,
      store: store.name,
      localFolder: storeUploadFolder,
      dropboxFolder: `Trademe Uploads/${store.name}/${dateFolder}/${safePhotoType}`,
      filename: savedFiles.join(";"),
      files: savedFiles
    });

  } catch (error) {

    console.error(error);

    res.status(500).json({
      success: false,
      error: "Upload failed"
    });

  }
});

app.post("/store-login", (req, res) => {
  console.log("LOGIN BODY:", req.body);

  const storeId = req.body.storeId;
  const storePassword = req.body.storePassword;

  const store = stores[storeId];

  if (!store || store.password !== storePassword) {
    return res.status(403).json({
      success: false,
      error: "Invalid store password"
    });
  }

  res.json({
    success: true,
    storeId,
    storeName: store.name
  });
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});