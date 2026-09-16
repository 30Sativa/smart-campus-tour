const fs = require('fs');
const dest = 'C:/\u0110\u1ed3 \u00c1n/smart-campus-tour/web/public/campus-tour-landing.html';

const parts = [];

// HEAD
parts.push(`<!DOCTYPE html>
<html lang="vi">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>CampusTour DT-AMR \u2014 Robot d\u1eabn tour th\u00f4ng minh</title>
  <meta name="description" content="H\u1ec7 th\u1ed1ng tham quan khu\u00f4n vi\u00ean \u0111\u1ea1i h\u1ecdc b\u1eb1ng robot t\u1ef1 h\u00e0nh AMR, AI tr\u1ee3 l\u00fd \u0111a ng\u00f4n ng\u1eef v\u00e0 Digital Twin." />
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Mona+Sans:wght@400;500;600;700&family=Inter:wght@300;400;500;600;700&display=swap" rel="stylesheet" />
  <script src="https://cdn.jsdelivr.net/npm/gsap@3.12.5/dist/gsap.min.js"></script>
  <script src="https://cdn.jsdelivr.net/npm/gsap@3.12.5/dist/ScrollTrigger.min.js"></script>
  <script src="https://cdn.jsdelivr.net/npm/@studio-freight/lenis@1.0.42/dist/lenis.min.js"></script>`);

fs.writeFileSync(dest, parts.join(''), 'utf8');
console.log('HEAD written, size:', fs.statSync(dest).size);
