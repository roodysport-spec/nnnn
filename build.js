const fs = require('fs');
const path = require('path');

const srcDir = __dirname;
const destDir = path.join(srcDir, 'dist');

// Files/folders to copy
const targets = [
    'css',
    'js',
    'assets',
    'icons',
    'lib',
    'firebase-messaging-sw.js',
    'sw.js',
    'config.js',
    'dukhan_logic.js',
    'capacitor.config.json',
    'google-services.json',
    'manifest.json',
    'admin.html',
    'admin_video.html',
    'cafe.html',
    'index.html',
    'owner.html',
    'owner2.html'
];

function deleteFolderRecursive(directoryPath) {
    if (fs.existsSync(directoryPath)) {
        fs.readdirSync(directoryPath).forEach((file) => {
            const curPath = path.join(directoryPath, file);
            if (fs.lstatSync(curPath).isDirectory()) {
                deleteFolderRecursive(curPath);
            } else {
                fs.unlinkSync(curPath);
            }
        });
        fs.rmdirSync(directoryPath);
    }
}

function copyRecursive(src, dest) {
    const exists = fs.existsSync(src);
    const stats = exists && fs.statSync(src);
    const isDirectory = exists && stats.isDirectory();
    if (isDirectory) {
        if (!fs.existsSync(dest)) {
            fs.mkdirSync(dest, { recursive: true });
        }
        fs.readdirSync(src).forEach((childItemName) => {
            copyRecursive(path.join(src, childItemName), path.join(dest, childItemName));
        });
    } else {
        fs.copyFileSync(src, dest);
    }
}

function build(ownerMode = false) {
    console.log(`Starting build (OwnerMode: ${ownerMode})...`);
    
    // 1. Clean dist
    deleteFolderRecursive(destDir);
    fs.mkdirSync(destDir, { recursive: true });

    // 2. Copy targets
    targets.forEach(target => {
        const srcPath = path.join(srcDir, target);
        const destPath = path.join(destDir, target);
        if (fs.existsSync(srcPath)) {
            copyRecursive(srcPath, destPath);
        }
    });

    // 3. For owner mode, copy owner.html to index.html
    if (ownerMode) {
        fs.copyFileSync(path.join(destDir, 'owner.html'), path.join(destDir, 'index.html'));
        console.log('Copied owner.html to index.html for Owner Mode');
    }

    console.log('Build completed successfully!');
}

const args = process.argv.slice(2);
const isOwner = args.includes('--owner');
build(isOwner);
