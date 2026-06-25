<template>
  <div class="absolute inset-0 flex items-center justify-center bg-black overflow-hidden">
    <!-- Background nebula overlay -->
    <div class="nebula-bg"></div>

    <svg
      viewBox="0 0 800 1000"
      class="loading-svg"
      xmlns="http://www.w3.org/2000/svg"
      preserveAspectRatio="xMidYMid meet"
    >
      <defs>
        <!-- Background gradient -->
        <linearGradient id="bg-grad" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stop-color="#0a0015" />
          <stop offset="50%" stop-color="#0f0a2e" />
          <stop offset="100%" stop-color="#000000" />
        </linearGradient>

        <!-- Portal gradients - more vibrant -->
        <linearGradient id="portal-grad" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stop-color="#ff6bd6">
            <animate attributeName="stop-color" values="#ff6bd6;#6366f1;#38bdf8;#ff6bd6" dur="4s" repeatCount="indefinite" />
          </stop>
          <stop offset="50%" stop-color="#6366f1">
            <animate attributeName="stop-color" values="#6366f1;#38bdf8;#ff6bd6;#6366f1" dur="4s" repeatCount="indefinite" />
          </stop>
          <stop offset="100%" stop-color="#38bdf8">
            <animate attributeName="stop-color" values="#38bdf8;#ff6bd6;#6366f1;#38bdf8" dur="4s" repeatCount="indefinite" />
          </stop>
        </linearGradient>

        <linearGradient id="portal-grad-2" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="#f472b6">
            <animate attributeName="stop-color" values="#f472b6;#818cf8;#22d3ee;#f472b6" dur="3s" repeatCount="indefinite" />
          </stop>
          <stop offset="100%" stop-color="#22d3ee">
            <animate attributeName="stop-color" values="#22d3ee;#f472b6;#818cf8;#22d3ee" dur="3s" repeatCount="indefinite" />
          </stop>
        </linearGradient>

        <linearGradient id="hair-grad" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stop-color="#818cf8" />
          <stop offset="50%" stop-color="#c084fc" />
          <stop offset="100%" stop-color="#f472b6" />
        </linearGradient>

        <linearGradient id="book-grad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="#22d3ee" />
          <stop offset="100%" stop-color="#818cf8" />
        </linearGradient>

        <!-- Enhanced glow with color cycle -->
        <radialGradient id="glow-grad" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stop-color="#22d3ee" stop-opacity="0.8">
            <animate attributeName="stop-color" values="#22d3ee;#c084fc;#f472b6;#22d3ee" dur="3s" repeatCount="indefinite" />
          </stop>
          <stop offset="60%" stop-color="#6366f1" stop-opacity="0.3" />
          <stop offset="100%" stop-color="#0f0a2e" stop-opacity="0" />
        </radialGradient>

        <!-- Inner portal glow -->
        <radialGradient id="portal-inner-glow" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stop-color="#fff" stop-opacity="0.4">
            <animate attributeName="stop-opacity" values="0.4;0.8;0.4" dur="2s" repeatCount="indefinite" />
          </stop>
          <stop offset="100%" stop-color="#6366f1" stop-opacity="0" />
        </radialGradient>

        <!-- Star glow filter -->
        <filter id="star-glow" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur in="SourceGraphic" stdDeviation="2" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>

        <!-- Strong glow for portal -->
        <filter id="portal-glow" x="-30%" y="-30%" width="160%" height="160%">
          <feGaussianBlur in="SourceGraphic" stdDeviation="8" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>

        <!-- Text gradient -->
        <linearGradient id="text-grad" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stop-color="#f472b6">
            <animate attributeName="stop-color" values="#f472b6;#22d3ee;#c084fc;#f472b6" dur="4s" repeatCount="indefinite" />
          </stop>
          <stop offset="50%" stop-color="#22d3ee">
            <animate attributeName="stop-color" values="#22d3ee;#c084fc;#f472b6;#22d3ee" dur="4s" repeatCount="indefinite" />
          </stop>
          <stop offset="100%" stop-color="#c084fc">
            <animate attributeName="stop-color" values="#c084fc;#f472b6;#22d3ee;#c084fc" dur="4s" repeatCount="indefinite" />
          </stop>
        </linearGradient>

        <!-- Aurora gradient -->
        <linearGradient id="aurora-grad" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stop-color="#22d3ee" stop-opacity="0" />
          <stop offset="30%" stop-color="#818cf8" stop-opacity="0.3" />
          <stop offset="50%" stop-color="#c084fc" stop-opacity="0.5" />
          <stop offset="70%" stop-color="#f472b6" stop-opacity="0.3" />
          <stop offset="100%" stop-color="#22d3ee" stop-opacity="0" />
        </linearGradient>
      </defs>

      <!-- Background -->
      <rect width="800" height="1000" fill="url(#bg-grad)" />

      <!-- Aurora bands -->
      <g class="aurora" opacity="0.4">
        <path d="M0 200 Q200 150 400 200 Q600 250 800 180" fill="none" stroke="url(#aurora-grad)" stroke-width="40" class="aurora-band-1" />
        <path d="M0 250 Q250 200 450 260 Q650 300 800 230" fill="none" stroke="url(#aurora-grad)" stroke-width="30" class="aurora-band-2" />
      </g>

      <!-- Enhanced stars - more and brighter -->
      <g id="stars" filter="url(#star-glow)">
        <circle cx="120" cy="150" r="2.5" fill="#fff" class="star" style="animation-delay: 0.2s" />
        <circle cx="250" cy="80" r="3.5" fill="#22d3ee" class="star star-bright" style="animation-delay: 0.7s" />
        <circle cx="680" cy="200" r="2" fill="#fff" class="star" style="animation-delay: 1.1s" />
        <circle cx="550" cy="120" r="3" fill="#c084fc" class="star star-bright" style="animation-delay: 0.5s" />
        <circle cx="180" cy="380" r="2.5" fill="#fff" class="star" style="animation-delay: 1.5s" />
        <circle cx="720" cy="420" r="3.5" fill="#f472b6" class="star star-bright" style="animation-delay: 0.1s" />
        <circle cx="90" cy="600" r="2" fill="#fff" class="star" style="animation-delay: 0.9s" />
        <circle cx="700" cy="650" r="2.5" fill="#818cf8" class="star" style="animation-delay: 1.3s" />
        <circle cx="150" cy="220" r="1.5" fill="#fff" class="star" style="animation-delay: 0.4s" />
        <circle cx="310" cy="180" r="2.5" fill="#22d3ee" class="star" style="animation-delay: 1.8s" />
        <circle cx="620" cy="90" r="2.5" fill="#fff" class="star" style="animation-delay: 0.3s" />
        <circle cx="400" cy="70" r="2" fill="#c084fc" class="star star-bright" style="animation-delay: 1.2s" />
        <!-- Extra stars -->
        <circle cx="50" cy="300" r="1.5" fill="#f472b6" class="star" style="animation-delay: 0.6s" />
        <circle cx="750" cy="350" r="2" fill="#22d3ee" class="star" style="animation-delay: 1.4s" />
        <circle cx="200" cy="500" r="1.5" fill="#fff" class="star" style="animation-delay: 0.8s" />
        <circle cx="600" cy="550" r="2.5" fill="#818cf8" class="star star-bright" style="animation-delay: 1.6s" />
        <circle cx="350" cy="100" r="2" fill="#f472b6" class="star" style="animation-delay: 2.0s" />
        <circle cx="500" cy="60" r="1.5" fill="#fff" class="star" style="animation-delay: 0.15s" />
      </g>

      <!-- Magic particles - more and varied -->
      <g id="particles">
        <circle cx="380" cy="730" r="3" fill="#22d3ee" class="particle p1" />
        <circle cx="420" cy="740" r="4" fill="#c084fc" class="particle p2" />
        <circle cx="390" cy="750" r="2.5" fill="#fff" class="particle p3" />
        <circle cx="410" cy="720" r="3.5" fill="#818cf8" class="particle p4" />
        <circle cx="370" cy="745" r="2" fill="#f472b6" class="particle p5" />
        <circle cx="430" cy="735" r="3" fill="#22d3ee" class="particle p6" />
        <circle cx="400" cy="760" r="2.5" fill="#fff" class="particle p7" />
        <circle cx="385" cy="725" r="2" fill="#c084fc" class="particle p8" />
      </g>

      <!-- Portal group with enhanced effects -->
      <g class="portal-group">
        <!-- Outer glow ring -->
        <ellipse cx="400" cy="750" rx="200" ry="55" fill="none" stroke="url(#portal-grad)" stroke-width="1" opacity="0.3" class="portal-ring-slow" />

        <!-- Wave rings -->
        <ellipse cx="400" cy="750" rx="150" ry="40" fill="none" stroke="url(#portal-grad-2)" stroke-width="2" class="wave" />
        <ellipse cx="400" cy="750" rx="150" ry="40" fill="none" stroke="#22d3ee" stroke-width="1.5" class="wave wave-d1" />
        <ellipse cx="400" cy="750" rx="150" ry="40" fill="none" stroke="#f472b6" stroke-width="1" class="wave wave-d2" />

        <!-- Main portal rings -->
        <ellipse cx="400" cy="750" rx="180" ry="48" fill="none" stroke="url(#portal-grad)" stroke-width="6" class="portal-ring" stroke-dasharray="30 15 10 10" filter="url(#portal-glow)" />
        <ellipse cx="400" cy="750" rx="140" ry="35" fill="none" stroke="url(#portal-grad-2)" stroke-width="3" class="portal-ring-reverse" stroke-dasharray="20 10 40 10" />
        <ellipse cx="400" cy="750" rx="100" ry="25" fill="none" stroke="#fff" stroke-width="1" class="portal-ring" stroke-dasharray="5 15" opacity="0.5" />

        <!-- Inner glow -->
        <ellipse cx="400" cy="750" rx="90" ry="22" fill="url(#glow-grad)" opacity="0.9" />
        <ellipse cx="400" cy="750" rx="60" ry="15" fill="url(#portal-inner-glow)" />
      </g>

      <!-- Floating books with glow -->
      <g id="stage-books">
        <g class="book1">
          <path d="M180 430 Q200 425 220 430 L230 460 Q210 455 190 460 Z" fill="url(#book-grad)" stroke="#22d3ee" stroke-width="2" />
          <path d="M190 460 Q210 455 230 460 L235 455 Q215 450 195 455 Z" fill="#fff" opacity="0.9" />
          <circle cx="210" cy="445" r="35" fill="url(#glow-grad)" opacity="0.5" pointer-events="none" class="book-glow" />
        </g>
        <g class="book2">
          <path d="M550 410 Q570 415 590 410 L595 440 Q575 445 555 440 Z" fill="url(#book-grad)" stroke="#c084fc" stroke-width="2" />
          <path d="M555 440 Q575 445 595 440 L598 435 Q578 440 558 435 Z" fill="#fff" opacity="0.9" />
          <circle cx="575" cy="425" r="30" fill="url(#glow-grad)" opacity="0.4" pointer-events="none" class="book-glow" />
        </g>
        <g class="book3">
          <path d="M520 520 Q540 510 560 515 L565 545 Q545 540 525 550 Z" fill="url(#book-grad)" stroke="#f472b6" stroke-width="2" />
          <circle cx="542" cy="530" r="25" fill="url(#glow-grad)" opacity="0.3" pointer-events="none" class="book-glow" />
        </g>
      </g>

      <!-- Character body -->
      <g class="luna-body">
        <!-- Shadow/glow under character -->
        <ellipse cx="400" cy="735" rx="55" ry="18" fill="url(#glow-grad)" opacity="0.8" class="shadow-glow" />

        <!-- Cape -->
        <g class="cape-wave">
          <path d="M360 440 L310 650 Q400 680 490 650 L440 440 Z" fill="#1e1b4b" stroke="#818cf8" stroke-width="2" />
          <path d="M330 480 L290 640 Q340 660 390 640 Z" fill="url(#hair-grad)" opacity="0.3" />
        </g>

        <!-- Torso -->
        <g id="luna-torso">
          <rect x="375" y="620" width="16" height="110" rx="8" fill="#fff" opacity="0.9" />
          <rect x="409" y="620" width="16" height="110" rx="8" fill="#fff" opacity="0.9" />
          <path d="M370 720 h24 v15 h-24 z" rx="4" fill="#818cf8" />
          <path d="M405 720 h24 v15 h-24 z" rx="4" fill="#818cf8" />
          <path d="M350 440 L330 620 H470 L450 440 Z" fill="#0f172a" stroke="#22d3ee" stroke-width="2" />
          <path d="M365 440 L400 490 L435 440" fill="none" stroke="url(#portal-grad)" stroke-width="4" />
          <circle cx="400" cy="490" r="6" fill="#fff">
            <animate attributeName="r" values="6;8;6" dur="2s" repeatCount="indefinite" />
            <animate attributeName="opacity" values="1;0.7;1" dur="2s" repeatCount="indefinite" />
          </circle>
        </g>

        <!-- Head -->
        <g id="luna-head">
          <circle cx="400" cy="350" r="55" fill="#fef08a" opacity="0.95" />

          <!-- Blush -->
          <ellipse cx="365" cy="370" rx="10" ry="5" fill="#f43f5e" opacity="0.4" />
          <ellipse cx="435" cy="370" rx="10" ry="5" fill="#f43f5e" opacity="0.4" />

          <!-- Eyes -->
          <g class="eye">
            <ellipse cx="370" cy="350" rx="12" ry="16" fill="#0f172a" />
            <circle cx="367" cy="345" r="5" fill="#fff" />
            <circle cx="373" cy="354" r="2" fill="#fff" />
            <path d="M355 338 Q370 332 385 338" fill="none" stroke="#000" stroke-width="3" stroke-linecap="round" />
            <ellipse cx="430" cy="350" rx="12" ry="16" fill="#0f172a" />
            <circle cx="427" cy="345" r="5" fill="#fff" />
            <circle cx="433" cy="354" r="2" fill="#fff" />
            <path d="M415 338 Q430 332 445 338" fill="none" stroke="#000" stroke-width="3" stroke-linecap="round" />
          </g>

          <!-- Mouth -->
          <path d="M392 382 Q400 390 408 382" fill="none" stroke="#000" stroke-width="3" stroke-linecap="round" />

          <!-- Hair -->
          <g class="hair-wave">
            <path d="M335 340 Q310 450 320 520 Q350 500 350 420 Z" fill="url(#hair-grad)" />
            <path d="M465 340 Q490 450 480 520 Q450 500 450 420 Z" fill="url(#hair-grad)" />
            <path d="M340 320 Q400 280 460 320 Q440 350 420 335 Q400 360 380 335 Q360 350 340 320 Z" fill="url(#hair-grad)" stroke="#c084fc" stroke-width="1" />
            <path d="M400 285 Q390 250 415 240 Q405 260 400 285 Z" fill="#818cf8" />
          </g>
        </g>

        <!-- Arms -->
        <g id="luna-arms">
          <path d="M350 440 Q310 480 330 540" fill="none" stroke="#0f172a" stroke-width="14" stroke-linecap="round" />
          <circle cx="330" cy="545" r="7" fill="#fef08a" />
          <path d="M450 440 Q490 480 470 530" fill="none" stroke="#0f172a" stroke-width="14" stroke-linecap="round" />
          <circle cx="470" cy="535" r="7" fill="#fef08a" />
        </g>
      </g>

      <!-- Loading text with gradient -->
      <text x="400" y="880" class="loading-text" fill="url(#text-grad)">正在召唤你的英语老师...</text>

      <!-- Progress dots -->
      <g class="progress-dots">
        <circle cx="370" cy="920" r="4" fill="#f472b6" class="dot dot-1" />
        <circle cx="400" cy="920" r="4" fill="#818cf8" class="dot dot-2" />
        <circle cx="430" cy="920" r="4" fill="#22d3ee" class="dot dot-3" />
      </g>

      <!-- Enhanced meteors with trails -->
      <g class="meteors">
        <line x1="100" y1="200" x2="180" y2="280" stroke="url(#portal-grad)" stroke-width="3" stroke-linecap="round" opacity="0.6" class="meteor">
          <animate attributeName="stroke-dasharray" values="0,300;300,300;300,0" dur="3s" repeatCount="indefinite" />
        </line>
        <line x1="650" y1="100" x2="570" y2="180" stroke="url(#portal-grad-2)" stroke-width="2" stroke-linecap="round" opacity="0.5" class="meteor">
          <animate attributeName="stroke-dasharray" values="0,300;300,300;300,0" dur="2.5s" repeatCount="indefinite" />
        </line>
        <!-- Extra meteors -->
        <line x1="300" y1="50" x2="250" y2="120" stroke="#f472b6" stroke-width="1.5" stroke-linecap="round" opacity="0.4" class="meteor">
          <animate attributeName="stroke-dasharray" values="0,200;200,200;200,0" dur="4s" begin="1s" repeatCount="indefinite" />
        </line>
        <line x1="500" y1="80" x2="550" y2="150" stroke="#22d3ee" stroke-width="1.5" stroke-linecap="round" opacity="0.3" class="meteor">
          <animate attributeName="stroke-dasharray" values="0,200;200,200;200,0" dur="3.5s" begin="2s" repeatCount="indefinite" />
        </line>
      </g>

      <!-- Sparkle effects around portal -->
      <g class="sparkles">
        <circle cx="300" cy="720" r="2" fill="#fff" class="sparkle s1" />
        <circle cx="500" cy="730" r="2" fill="#fff" class="sparkle s2" />
        <circle cx="350" cy="780" r="1.5" fill="#f472b6" class="sparkle s3" />
        <circle cx="450" cy="770" r="1.5" fill="#22d3ee" class="sparkle s4" />
        <circle cx="280" cy="750" r="2" fill="#c084fc" class="sparkle s5" />
        <circle cx="520" cy="745" r="2" fill="#818cf8" class="sparkle s6" />
      </g>
    </svg>
  </div>
</template>

<style scoped>

.loading-svg {
  width: 100%;
  height: 100%;
  max-width: 600px;
  max-height: 750px;
  position: relative;
  z-index: 1;
}

/* Nebula background effect */
.nebula-bg {
  position: absolute;
  inset: 0;
  background:
    radial-gradient(ellipse at 30% 20%, rgba(99, 102, 241, 0.15) 0%, transparent 50%),
    radial-gradient(ellipse at 70% 80%, rgba(192, 132, 252, 0.1) 0%, transparent 50%),
    radial-gradient(ellipse at 50% 50%, rgba(56, 189, 248, 0.05) 0%, transparent 70%);
  animation: nebula-pulse 8s infinite ease-in-out;
}

@keyframes nebula-pulse {
  0%, 100% { opacity: 0.6; }
  50% { opacity: 1; }
}

/* ========== Aurora ========== */
.aurora {
  animation: aurora-drift 10s infinite ease-in-out;
}

.aurora-band-1 {
  animation: aurora-wave-1 8s infinite ease-in-out;
}

.aurora-band-2 {
  animation: aurora-wave-2 10s infinite ease-in-out;
}

@keyframes aurora-drift {
  0%, 100% { transform: translateX(0); }
  50% { transform: translateX(20px); }
}

@keyframes aurora-wave-1 {
  0%, 100% { transform: translateY(0) scaleY(1); opacity: 0.3; }
  50% { transform: translateY(-10px) scaleY(1.2); opacity: 0.5; }
}

@keyframes aurora-wave-2 {
  0%, 100% { transform: translateY(0) scaleY(1); opacity: 0.2; }
  50% { transform: translateY(10px) scaleY(1.3); opacity: 0.4; }
}

/* ========== Stars ========== */
.star {
  animation: blink 2s infinite ease-in-out;
}

.star-bright {
  animation: blink-bright 1.5s infinite ease-in-out;
}

@keyframes blink {
  0%, 100% { opacity: 0.3; }
  50% { opacity: 1; }
}

@keyframes blink-bright {
  0%, 100% { opacity: 0.4; transform: scale(1); }
  50% { opacity: 1; transform: scale(1.3); }
}

/* ========== Portal ========== */
.portal-group {
  transform-origin: 400px 750px;
  animation: portal-intro 0.8s cubic-bezier(0.34, 1.56, 0.64, 1) forwards;
}

.portal-ring {
  transform-origin: 400px 750px;
  animation: rotate 6s infinite linear;
}

.portal-ring-reverse {
  transform-origin: 400px 750px;
  animation: rotate-rev 4s infinite linear;
}

.portal-ring-slow {
  transform-origin: 400px 750px;
  animation: rotate 12s infinite linear;
}

.wave {
  transform-origin: 400px 750px;
  animation: wave-out 2s infinite linear;
}

.wave-d1 {
  animation-delay: 0.7s;
}

.wave-d2 {
  animation-delay: 1.4s;
}

@keyframes portal-intro {
  from { transform: scale(0); opacity: 0; }
  to { transform: scale(1); opacity: 1; }
}

@keyframes rotate {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

@keyframes rotate-rev {
  from { transform: rotate(360deg); }
  to { transform: rotate(0deg); }
}

@keyframes wave-out {
  0% { transform: scale(0.8); opacity: 0.8; }
  100% { transform: scale(1.5); opacity: 0; }
}

/* ========== Character entrance ========== */
.luna-body {
  transform-origin: 400px 500px;
  animation: luna-entrance 3s cubic-bezier(0.25, 1, 0.5, 1) forwards;
}

@keyframes luna-entrance {
  0% { transform: translate(0, 200px) scale(0.3) rotateY(180deg); opacity: 0; filter: brightness(3); }
  15% { opacity: 1; }
  66% { transform: translate(0, 0) scale(1) rotateY(180deg); filter: brightness(1.2); }
  80% { transform: translate(0, 0) scale(1) rotateY(90deg); }
  100% { transform: translate(0, 0) scale(1) rotateY(0deg); filter: brightness(1); }
}

/* ========== Hair/Cape sway ========== */
.hair-wave {
  animation: sway 3s infinite ease-in-out 3s;
  transform-origin: 400px 300px;
}

.cape-wave {
  animation: sway-reverse 4s infinite ease-in-out 3s;
  transform-origin: 400px 450px;
}

@keyframes sway {
  0%, 100% { transform: rotate(0deg); }
  50% { transform: rotate(3deg); }
}

@keyframes sway-reverse {
  0%, 100% { transform: rotate(0deg); }
  50% { transform: rotate(-4deg); }
}

/* ========== Eye blink ========== */
.eye {
  animation: blink-eye 4s infinite step-end 3s;
  transform-origin: 400px 350px;
}

@keyframes blink-eye {
  0%, 95%, 100% { transform: scaleY(1); }
  97% { transform: scaleY(0.1); }
}

/* ========== Floating books ========== */
.book1 {
  animation: float-b1 3s infinite ease-in-out;
  transform-origin: 220px 450px;
}

.book2 {
  animation: float-b2 3.5s infinite ease-in-out 0.5s;
  transform-origin: 580px 420px;
}

.book3 {
  animation: float-b3 4s infinite ease-in-out 1s;
  transform-origin: 550px 520px;
}

.book-glow {
  animation: glow-pulse 2s infinite ease-in-out;
}

@keyframes float-b1 {
  0%, 100% { transform: translateY(0) rotate(5deg); }
  50% { transform: translateY(-20px) rotate(-5deg); }
}

@keyframes float-b2 {
  0%, 100% { transform: translateY(0) rotate(-8deg); }
  50% { transform: translateY(-15px) rotate(8deg); }
}

@keyframes float-b3 {
  0%, 100% { transform: translateY(0) rotate(12deg); }
  50% { transform: translateY(-25px) rotate(-2deg); }
}

@keyframes glow-pulse {
  0%, 100% { opacity: 0.3; transform: scale(1); }
  50% { opacity: 0.6; transform: scale(1.1); }
}

/* ========== Particles ========== */
.particle {
  animation: particle-up 2.5s infinite linear;
}

.p1 { --mx: -40px; --my: -150px; animation-delay: 0s; }
.p2 { --mx: 50px; --my: -200px; animation-delay: 0.3s; }
.p3 { --mx: -80px; --my: -120px; animation-delay: 0.6s; }
.p4 { --mx: 30px; --my: -180px; animation-delay: 0.9s; }
.p5 { --mx: -60px; --my: -160px; animation-delay: 1.2s; }
.p6 { --mx: 70px; --my: -140px; animation-delay: 1.5s; }
.p7 { --mx: -20px; --my: -190px; animation-delay: 1.8s; }
.p8 { --mx: 40px; --my: -170px; animation-delay: 2.1s; }

@keyframes particle-up {
  0% { transform: translate(0, 0); opacity: 0; }
  10% { opacity: 1; }
  90% { opacity: 0.8; }
  100% { transform: translate(var(--mx), var(--my)); opacity: 0; }
}

/* ========== Sparkles ========== */
.sparkle {
  animation: sparkle-blink 1.5s infinite ease-in-out;
}

.s1 { animation-delay: 0s; }
.s2 { animation-delay: 0.25s; }
.s3 { animation-delay: 0.5s; }
.s4 { animation-delay: 0.75s; }
.s5 { animation-delay: 1s; }
.s6 { animation-delay: 1.25s; }

@keyframes sparkle-blink {
  0%, 100% { opacity: 0; transform: scale(0); }
  50% { opacity: 1; transform: scale(1.5); }
}

/* ========== Loading text ========== */
.loading-text {
  font-family: system-ui, -apple-system, sans-serif;
  font-size: 26px;
  font-weight: 600;
  letter-spacing: 3px;
  animation: text-breath 2s infinite ease-in-out;
  text-anchor: middle;
}

@keyframes text-breath {
  0%, 100% { opacity: 0.5; filter: drop-shadow(0 0 4px rgba(99, 102, 241, 0.5)); }
  50% { opacity: 1; filter: drop-shadow(0 0 15px rgba(56, 189, 248, 0.8)); }
}

/* ========== Progress dots ========== */
.dot {
  animation: dot-bounce 1.2s infinite ease-in-out;
}

.dot-1 { animation-delay: 0s; }
.dot-2 { animation-delay: 0.2s; }
.dot-3 { animation-delay: 0.4s; }

@keyframes dot-bounce {
  0%, 80%, 100% { transform: translateY(0); opacity: 0.5; }
  40% { transform: translateY(-10px); opacity: 1; }
}

/* ========== Shadow glow ========== */
.shadow-glow {
  animation: shadow-pulse 2s infinite ease-in-out;
}

@keyframes shadow-pulse {
  0%, 100% { opacity: 0.6; transform: scaleX(1); }
  50% { opacity: 0.9; transform: scaleX(1.1); }
}
</style>
