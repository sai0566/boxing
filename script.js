// game3d.js - Freestanding Bag Version 2.2 (Sound and Centering Focus)
console.log("game3d.js (Freestanding Bag V2.2) script started");

// --- DOM Elements ---
const scoreDisplay = document.getElementById('scoreDisplay');
const speedDisplay = document.getElementById('speedDisplay');
const canvasContainer = document.getElementById('canvasContainer');
const resetButton = document.getElementById('resetButton');
const canvas = document.getElementById('boxingCanvas3D');

// --- Sound Elements & State ---
const punchSoundIds = ['punchSound1', 'punchSound2', 'punchSound3'];
const punchSounds = [];
let audioContextUnlocked = false;

if (!scoreDisplay) console.warn("DOM Element 'scoreDisplay' NOT FOUND!");
if (!speedDisplay) console.warn("DOM Element 'speedDisplay' NOT FOUND!");
if (!canvasContainer) { console.error("FATAL: DOM Element 'canvasContainer' NOT FOUND!"); throw new Error("Canvas container missing"); }
if (!canvas) { console.error("FATAL: DOM Element 'boxingCanvas3D' NOT FOUND!"); throw new Error("Canvas element missing"); }

// --- Game State & Physics ---
let score = 0; let lastPunchTime = 0; const BASE_PUNCH_SCORE = 10;
const FAST_PUNCH_THRESHOLD_MS = 300; const MEDIUM_PUNCH_THRESHOLD_MS = 600;
let scene, camera, renderer, clock;
let bagGroup, bagMesh, standPole, standBase;
const BAG_RADIUS = 0.35, BAG_HEIGHT = 1.2, POLE_RADIUS = 0.08, POLE_HEIGHT = 1.3, BASE_RADIUS = 0.6, BASE_HEIGHT = 0.15;
const bagPhysics = {
    position: new THREE.Vector3(0, BASE_HEIGHT + POLE_HEIGHT + BAG_HEIGHT / 2, 0),
    velocity: new THREE.Vector3(0, 0, 0), displacement: new THREE.Vector3(0, 0, 0),
    springStiffness: 180, damping: 0.88, mass: 4.5, impactStrengthFactor: 0.9, maxDisplacement: 0.7,
    angularVelocityY: 0, rotationY: 0, torsionSpringStiffness: 100, torsionDamping: 0.85, maxRotationY: Math.PI / 6,
    impactFlashDuration: 0.15, impactFlashTimer: 0
};

function initAudio() {
    console.log("Initializing audio elements...");
    punchSoundIds.forEach((id, index) => {
        const soundElement = document.getElementById(id);
        if (soundElement && soundElement.tagName === 'AUDIO') {
            punchSounds[index] = soundElement;
            punchSounds[index].load();
            punchSounds[index].volume = 0.6;
            console.log(`Audio element '${id}' found. Initial ReadyState: ${soundElement.readyState}`);
        } else {
            console.warn(`Audio element with ID '${id}' NOT FOUND or not an AUDIO tag.`);
            punchSounds[index] = null;
        }
    });
}

function tryUnlockAudioContext() {
    if (audioContextUnlocked || !punchSounds.length) return Promise.resolve(audioContextUnlocked);

    return new Promise((resolve, reject) => {
        const firstValidSound = punchSounds.find(s => s !== null);
        if (firstValidSound) {
            // Browsers require a user gesture to start audio.
            // Playing a sound (even if paused immediately) can unlock the AudioContext.
            const currentVolume = firstValidSound.volume; // Store current volume
            firstValidSound.volume = 0.001; // Play almost silently for unlock
            const playPromise = firstValidSound.play();

            if (playPromise !== undefined) {
                playPromise.then(_ => {
                    firstValidSound.pause();
                    firstValidSound.currentTime = 0;
                    firstValidSound.volume = currentVolume; // Restore volume
                    audioContextUnlocked = true;
                    console.log("Audio context UNLOCKED successfully by user gesture.");
                    resolve(true);
                }).catch(error => {
                    firstValidSound.volume = currentVolume; // Restore volume on error too
                    console.warn("Audio context unlock FAILED (play() rejected):", error.name, error.message);
                    // Common errors: NotAllowedError (no user gesture), NotSupportedError
                    resolve(false); // Still resolve, but indicate failure
                });
            } else {
                // Very old browsers might not return a promise. Assume unlocked.
                firstValidSound.volume = currentVolume; // Restore volume
                audioContextUnlocked = true;
                console.log("Audio play() did not return a promise. Assuming context unlocked for older browser.");
                resolve(true);
            }
        } else {
            console.warn("No valid sound elements found to attempt audio unlock.");
            resolve(false); // No sounds to unlock with
        }
    });
}
function resetGame() {
    score = 0;
    scoreDisplay.textContent = 'Score: 0';
    speedDisplay.textContent = 'Punch Speed: Normal';
    bag.rotation.set(0, 0, 0);
    bag.material.color.set('#ff3e4d');
}


function init3D() {
    console.log("init3D() V2.2 called");
    if (typeof THREE === 'undefined') { console.error("FATAL: THREE.js library not loaded!"); throw new Error("THREE.js missing"); }
    scene = new THREE.Scene(); clock = new THREE.Clock();

    try {
        const cubeTextureLoader = new THREE.CubeTextureLoader();
        const skyboxImagePaths = ['px.jpg', 'nx.jpg', 'py.jpg', 'ny.jpg', 'pz.jpg', 'nz.jpg'];
        const skyboxTexture = cubeTextureLoader.load(skyboxImagePaths,
            () => { scene.background = skyboxTexture; console.log("Skybox texture LOADED successfully."); },
            undefined,
            (err) => { console.error('Skybox loading FAILED. Using fallback color.', err); scene.background = new THREE.Color(0x20232a); }
        );
         if(!scene.background) { scene.background = new THREE.Color(0x20232a); console.log("Set initial fallback background color while skybox loads."); }
    } catch (e) {
        console.error("EXCEPTION during skybox load initiation:", e);
        scene.background = new THREE.Color(0x20232a);
    }

    const initialAspect = (canvasContainer.clientWidth > 0 && canvasContainer.clientHeight > 0) ?
                          (canvasContainer.clientWidth / canvasContainer.clientHeight) : (16/9);
    camera = new THREE.PerspectiveCamera(55, initialAspect, 0.1, 1000);
    camera.position.set(0, POLE_HEIGHT * 0.85, 4.1);
    camera.lookAt(0, POLE_HEIGHT * 0.75, 0);
    console.log(`Camera created. Initial Aspect: ${initialAspect.toFixed(2)}`);

    try {
        renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true, alpha: false }); // Alpha false if BG is always set
        renderer.setPixelRatio(window.devicePixelRatio);
        renderer.shadowMap.enabled = true;
        renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        console.log("Renderer created.");
    } catch (e) { console.error("FATAL: FAILED to create WebGLRenderer:", e); alert("WebGL not supported or disabled."); throw e; }

    const ambientLight = new THREE.AmbientLight(0xffffff, 0.65); scene.add(ambientLight);
    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.85);
    directionalLight.position.set(4.5, 6.5, 5.5); directionalLight.castShadow = true;
    directionalLight.shadow.mapSize.width = 1024; directionalLight.shadow.mapSize.height = 1024;
    directionalLight.shadow.camera.near = 1; directionalLight.shadow.camera.far = 20; // Adjusted shadow camera
    directionalLight.shadow.camera.left = -7; directionalLight.shadow.camera.right = 7;
    directionalLight.shadow.camera.top = 7; directionalLight.shadow.camera.bottom = -7;
    scene.add(directionalLight);
    console.log("Lighting setup.");

    const groundGeometry = new THREE.PlaneGeometry(25, 25);
    const groundMaterial = new THREE.MeshStandardMaterial({ color: 0x383838, roughness: 0.85, metalness: 0.15 });
    const groundMesh = new THREE.Mesh(groundGeometry, groundMaterial);
    groundMesh.rotation.x = -Math.PI / 2; groundMesh.receiveShadow = true; scene.add(groundMesh);
    console.log("Ground created.");

    bagGroup = new THREE.Group(); scene.add(bagGroup);
    const baseMaterial = new THREE.MeshStandardMaterial({ color: 0x252525, metalness: 0.5, roughness: 0.6 });
    const baseGeom = new THREE.CylinderGeometry(BASE_RADIUS, BASE_RADIUS, BASE_HEIGHT, 32);
    standBase = new THREE.Mesh(baseGeom, baseMaterial);
    standBase.position.y = BASE_HEIGHT / 2; standBase.castShadow = true; standBase.receiveShadow = true; bagGroup.add(standBase);

    const poleMaterial = new THREE.MeshStandardMaterial({ color: 0x585858, metalness: 0.7, roughness: 0.4 });
    const poleGeom = new THREE.CylinderGeometry(POLE_RADIUS, POLE_RADIUS, POLE_HEIGHT, 16);
    standPole = new THREE.Mesh(poleGeom, poleMaterial);
    standPole.position.y = BASE_HEIGHT + POLE_HEIGHT / 2; standPole.castShadow = true; standPole.receiveShadow = true; bagGroup.add(standPole);

    const bagMaterial = new THREE.MeshStandardMaterial({ color: 0x980000, metalness: 0.2, roughness: 0.7, emissive: 0x000000 });
    const bagCylGeom = new THREE.CylinderGeometry(BAG_RADIUS, BAG_RADIUS, BAG_HEIGHT, 32);
    const bagSphGeom = new THREE.SphereGeometry(BAG_RADIUS, 32, 16, 0, Math.PI*2, 0, Math.PI/2);
    bagMesh = new THREE.Mesh(bagCylGeom, bagMaterial);
    const topCap = new THREE.Mesh(bagSphGeom, bagMaterial); topCap.rotation.x = Math.PI; topCap.position.y = BAG_HEIGHT/2; bagMesh.add(topCap);
    const botCap = new THREE.Mesh(bagSphGeom, bagMaterial); botCap.position.y = -BAG_HEIGHT/2; bagMesh.add(botCap);
    bagMesh.position.y = BASE_HEIGHT + POLE_HEIGHT + BAG_HEIGHT/2;
    bagMesh.castShadow = true; bagMesh.receiveShadow = true; bagGroup.add(bagMesh);
    bagPhysics.position.copy(bagMesh.position);
    console.log("Bag model setup complete.");

    onWindowResize();
    document.addEventListener('keydown', handleUserInteraction); // Keydown now also attempts to unlock audio
    canvasContainer.addEventListener('click', handleUserInteraction);
    canvasContainer.addEventListener('touchstart', handleUserInteraction, { passive: false });
    console.log("Event listeners added.");
    console.log("init3D() V2.2 completed.");
}

async function handleUserInteraction(event) { // Make this async to await audio unlock
    if (event.type === 'touchstart' || event.type === 'click' || (event.type === 'keydown' && event.code === 'Space')) {
        if (event.type === 'touchstart') event.preventDefault();

        if (!audioContextUnlocked) {
            await tryUnlockAudioContext(); // Wait for the unlock attempt
        }
        // If it's a spacebar press or click/tap on the canvas, proceed to punch
        if (event.type !== 'keydown' || event.code === 'Space') {
             if (!event.repeat) { // Avoid multiple punches on key hold
                handlePunchAction();
            }
        }
    }
}

let physicsUpdateCount = 0;
function updateBagPhysics(deltaTime) {
    if (deltaTime <= 0 || deltaTime > 0.1) {deltaTime = Math.max(0.001, Math.min(0.033, deltaTime));}
    if (!bagMesh || !standPole || !bagPhysics) { console.error("updateBagPhysics: Missing critical objects!"); return; }

    const forceX = -bagPhysics.springStiffness * bagPhysics.displacement.x;
    const forceZ = -bagPhysics.springStiffness * bagPhysics.displacement.z;
    const accelX = forceX / bagPhysics.mass; const accelZ = forceZ / bagPhysics.mass;
    bagPhysics.velocity.x += accelX * deltaTime; bagPhysics.velocity.z += accelZ * deltaTime;
    const dampingFactor = Math.pow(bagPhysics.damping, deltaTime * 60);
    bagPhysics.velocity.x *= dampingFactor; bagPhysics.velocity.z *= dampingFactor;
    bagPhysics.displacement.x += bagPhysics.velocity.x * deltaTime;
    bagPhysics.displacement.z += bagPhysics.velocity.z * deltaTime;

    const currentDisplacementMagSq = bagPhysics.displacement.x**2 + bagPhysics.displacement.z**2;
    if (currentDisplacementMagSq > bagPhysics.maxDisplacement**2) {
        const currentDisplacementMag = Math.sqrt(currentDisplacementMagSq);
        const scale = bagPhysics.maxDisplacement / currentDisplacementMag;
        bagPhysics.displacement.x *= scale; bagPhysics.displacement.z *= scale;
        bagPhysics.velocity.x *= scale * 0.3; bagPhysics.velocity.z *= scale * 0.3;
    }

    const torqueY = -bagPhysics.torsionSpringStiffness * bagPhysics.rotationY;
    const angularAccelY = torqueY / bagPhysics.mass;
    bagPhysics.angularVelocityY += angularAccelY * deltaTime;
    const torsionDampingFactor = Math.pow(bagPhysics.torsionDamping, deltaTime * 60);
    bagPhysics.angularVelocityY *= torsionDampingFactor;
    bagPhysics.rotationY += bagPhysics.angularVelocityY * deltaTime;
    bagPhysics.rotationY = Math.max(-bagPhysics.maxRotationY, Math.min(bagPhysics.maxRotationY, bagPhysics.rotationY));

    bagMesh.position.x = bagPhysics.position.x + bagPhysics.displacement.x;
    bagMesh.position.z = bagPhysics.position.z + bagPhysics.displacement.z;
    const tiltFromDispZ = -bagPhysics.displacement.x / (POLE_HEIGHT * 0.9) * 2.5;
    const tiltFromDispX =  bagPhysics.displacement.z / (POLE_HEIGHT * 0.9) * 2.5;
    bagMesh.rotation.set(tiltFromDispX, bagPhysics.rotationY, tiltFromDispZ);
    standPole.rotation.z = tiltFromDispZ * 0.55; standPole.rotation.x = tiltFromDispX * 0.55;

    if (isNaN(bagMesh.position.x) || isNaN(bagMesh.rotation.x)) {
        console.error("!!! NaN detected in bagMesh !!! Resetting physics.");
        Object.assign(bagPhysics, { velocity: new THREE.Vector3(0,0,0), displacement: new THREE.Vector3(0,0,0), angularVelocityY: 0, rotationY: 0 });
        bagMesh.position.copy(bagPhysics.position); bagMesh.rotation.set(0,0,0); standPole.rotation.set(0,0,0); return;
    }

    if (bagPhysics.impactFlashTimer > 0) {
        bagPhysics.impactFlashTimer -= deltaTime;
        const flashProgress = Math.max(0, bagPhysics.impactFlashTimer / bagPhysics.impactFlashDuration);
        const intensity = Math.sin(flashProgress * Math.PI) * 0.8;
        bagMesh.material.emissive.setRGB(intensity, intensity, intensity * 0.2);
        if (bagPhysics.impactFlashTimer <= 0) { bagMesh.material.emissive.setHex(0x000000); }
    }

    const posEps = 0.002, velEps = 0.008, rotEps = 0.008;
     if (Math.abs(bagPhysics.displacement.x) < posEps && Math.abs(bagPhysics.displacement.z) < posEps &&
        Math.abs(bagPhysics.velocity.x) < velEps && Math.abs(bagPhysics.velocity.z) < velEps &&
        Math.abs(bagPhysics.rotationY) < rotEps && Math.abs(bagPhysics.angularVelocityY) < velEps)
    {
        bagPhysics.displacement.set(0,0,0); bagPhysics.velocity.set(0,0,0);
        bagPhysics.rotationY = 0; bagPhysics.angularVelocityY = 0;
        bagMesh.position.copy(bagPhysics.position);
        bagMesh.rotation.set(0,0,0); standPole.rotation.set(0,0,0);
    }
    physicsUpdateCount++;
}

function punchBag(punchStrengthFactor) {
    if (!bagMesh || !camera) { console.warn("punchBag: bagMesh or camera not ready."); return; }
    const punchForceBase = bagPhysics.impactStrengthFactor * punchStrengthFactor;
    let camDirection = new THREE.Vector3(); camera.getWorldDirection(camDirection);
    let punchDirection = new THREE.Vector3(-camDirection.x, 0, -camDirection.z).normalize();
    if (punchDirection.lengthSq() < 0.01) { punchDirection.set(0,0,-1); } // Guard against camera looking straight up/down
    const randomAngle = (Math.random() - 0.5) * Math.PI / 5; // +/- 18 deg variation
    punchDirection.applyAxisAngle(new THREE.Vector3(0,1,0), randomAngle);
    bagPhysics.velocity.x += punchDirection.x * punchForceBase / bagPhysics.mass;
    bagPhysics.velocity.z += punchDirection.z * punchForceBase / bagPhysics.mass;
    const twistSign = Math.sign(punchDirection.x + (Math.random()-0.5)*0.1) || (Math.random() < 0.5 ? -1 : 1) ; // More varied twist
    const twistMagnitude = punchForceBase * 0.4 / bagPhysics.mass * (0.5 + punchStrengthFactor * 0.5); // More twist
    bagPhysics.angularVelocityY += twistSign * twistMagnitude;
    bagMesh.material.emissive.setHex(0xFFFF33);
    bagPhysics.impactFlashTimer = bagPhysics.impactFlashDuration;
}

function handlePunchAction() {
    const currentTime = Date.now();
    let punchStrengthFactor = 1.0, speedText = "Normal", soundIndex = 0;

    if (lastPunchTime > 0) {
        const timeDifference = currentTime - lastPunchTime;
        if (timeDifference < FAST_PUNCH_THRESHOLD_MS) {
            punchStrengthFactor = 1.8 + (FAST_PUNCH_THRESHOLD_MS - timeDifference) / FAST_PUNCH_THRESHOLD_MS * 0.7;
            speedText = "FAST!!"; soundIndex = 2;
        } else if (timeDifference < MEDIUM_PUNCH_THRESHOLD_MS) {
            punchStrengthFactor = 1.3; speedText = "Quick"; soundIndex = 1;
        } else {
            punchStrengthFactor = 0.8; speedText = "Slow..."; soundIndex = 0;
        }
    }
    else { soundIndex = 0; }
    lastPunchTime = currentTime;

    const scoreEarned = Math.round(BASE_PUNCH_SCORE * punchStrengthFactor);
    score += scoreEarned;

    if(scoreDisplay) scoreDisplay.textContent = `Score: ${score}`;
    if(speedDisplay) speedDisplay.textContent = `Punch Speed: ${speedText} (+${scoreEarned})`;

    playPunchSound(soundIndex);
    punchBag(punchStrengthFactor);
}

function playPunchSound(index) {
    if (!audioContextUnlocked) {
        console.warn("Audio context not yet unlocked. Sound playback might fail or be delayed.");
        // tryUnlockAudioContext(); // Could try again here, but gesture should have happened.
    }

    if (index < 0 || index >= punchSounds.length || !punchSounds[index]) {
        console.warn(`Invalid sound index: ${index} or sound element missing.`);
        return;
    }
    const soundToPlay = punchSounds[index];

    // console.log(`Attempting to play sound: ${punchSoundIds[index]}, ReadyState: ${soundToPlay.readyState}, Unlocked: ${audioContextUnlocked}`);
    if (soundToPlay.readyState >= HTMLMediaElement.HAVE_ENOUGH_DATA) { // HAVE_ENOUGH_DATA (4) is best
        soundToPlay.currentTime = 0;
        const playPromise = soundToPlay.play();
        if (playPromise !== undefined) {
            playPromise.then(_ => { /* console.log(`Sound '${punchSoundIds[index]}' playing.`); */ })
                       .catch(error => { console.error(`Error playing '${punchSoundIds[index]}': ${error.name} - ${error.message}`); });
        }
    } else if (soundToPlay.readyState >= HTMLMediaElement.HAVE_METADATA) { // HAVE_METADATA (1) means we can try
        console.warn(`Sound '${punchSoundIds[index]}' has metadata but not enough data (RS:${soundToPlay.readyState}). Playback might be choppy or delayed.`);
        soundToPlay.currentTime = 0; // Try anyway
        const playPromise = soundToPlay.play();
        if (playPromise !== undefined) {
            playPromise.catch(error => { console.error(`Error playing (metadata only) '${punchSoundIds[index]}': ${error.name} - ${error.message}`); });
        }
    } else {
        console.warn(`Sound '${punchSoundIds[index]}' not ready (RS:${soundToPlay.readyState}). Cannot play.`);
    }
}


function onWindowResize() {
    if (!camera || !renderer || !canvasContainer) { console.warn("onWindowResize: Critical objects missing."); return; }
    let cW = canvasContainer.clientWidth; let cH = canvasContainer.clientHeight;
    if (cW <=0 ) cW = window.innerWidth > 0 ? window.innerWidth : 300; // Min fallback
    if (cH <=0 ) cH = window.innerHeight > 0 ? window.innerHeight : 300; // Min fallback

    const aspect = cW / cH; camera.aspect = aspect;
    const baseFOV = 55, baseZ = 4.1, targetAspect = 16/9; // Reference aspect

    if (aspect < targetAspect * 0.9) { // More portrait than target
        camera.fov = baseFOV * (1 + (targetAspect / aspect - 1) * 0.22);
        camera.position.z = baseZ * (1 + (targetAspect / aspect - 1) * 0.18);
    } else if (aspect > targetAspect * 1.1) { // More landscape than target
        camera.fov = baseFOV * Math.max(0.9, (1 - (aspect / targetAspect - 1) * 0.08)); // Don't shrink FOV too much
        camera.position.z = baseZ * Math.min(1.05, (targetAspect / aspect) * 0.92) ; // Don't get too close
    } else { // Close to target aspect
        camera.fov = baseFOV;
        camera.position.z = baseZ;
    }

    camera.fov = Math.max(45, Math.min(70, camera.fov)); // Clamp FOV
    camera.position.z = Math.max(3.0, Math.min(baseZ + 2.0, camera.position.z)); // Clamp Z distance

    camera.updateProjectionMatrix(); renderer.setSize(cW, cH);
    // console.log(`Resized. Cont: ${cW}x${cH} Aspect: ${aspect.toFixed(2)}, FOV: ${camera.fov.toFixed(1)}, CamZ: ${camera.position.z.toFixed(2)}`);
}

let animationFrameId = null;
function animate() {
    animationFrameId = requestAnimationFrame(animate);
    if (!clock || !renderer || !scene || !camera) { return; }
    try {
        const deltaTime = clock.getDelta();
        updateBagPhysics(deltaTime);
        renderer.render(scene, camera);
    } catch (e) { console.error("Error in animation loop:", e); /* Consider stopping loop: cancelAnimationFrame(animationFrameId); */ }
}

document.addEventListener('DOMContentLoaded', () => {
    console.log("DOM fully loaded. Initializing game (V2.2).");
    resetButton.addEventListener('click', resetGame);
    initAudio();
    try {
        init3D();
        if (scene && camera && renderer && clock) {
            animate();
            console.log("Animation loop started (V2.2).");
        } else {
            console.error("Initialization incomplete. Animation loop NOT started.");
            alert("Game init failed critically. Check console (WebGL/assets).");
        }
    } catch (error) {
        console.error("EXCEPTION during init3D or starting animation:", error);
        alert("An unrecoverable error occurred during game startup. See console for details.");
    }
});

window.addEventListener('resize', onWindowResize, false);
console.log("game3d.js (Freestanding Bag V2.2) script finished parsing.");
