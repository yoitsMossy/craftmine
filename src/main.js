import * as THREE from 'three';

const canvas = document.querySelector('#game');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);

const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0x8ac0ff, 20, 180);

const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 400);

const clock = new THREE.Clock();

const helpPanel = document.querySelector('#help');
const statsPanel = document.querySelector('#stats');
const hotbar = document.querySelector('#hotbar');

const BLOCK = {
  AIR: 0,
  GRASS: 1,
  DIRT: 2,
  STONE: 3,
  SAND: 4,
  WOOD: 5,
  LEAVES: 6,
  COBBLE: 7,
  PLANKS: 8,
};

const blockCatalog = [
  { id: BLOCK.GRASS, name: 'Grass' },
  { id: BLOCK.DIRT, name: 'Dirt' },
  { id: BLOCK.STONE, name: 'Stone' },
  { id: BLOCK.SAND, name: 'Sand' },
  { id: BLOCK.WOOD, name: 'Wood' },
  { id: BLOCK.LEAVES, name: 'Leaves' },
  { id: BLOCK.COBBLE, name: 'Cobble' },
  { id: BLOCK.PLANKS, name: 'Planks' },
];

let selectedSlot = 0;

const worldSize = { x: 80, y: 42, z: 80 };
const waterLevel = 11;
const world = new Uint8Array(worldSize.x * worldSize.y * worldSize.z);

function indexFrom(x, y, z) {
  return x + worldSize.x * (z + worldSize.z * y);
}

function inBounds(x, y, z) {
  return x >= 0 && z >= 0 && y >= 0 && x < worldSize.x && z < worldSize.z && y < worldSize.y;
}

function getBlock(x, y, z) {
  if (!inBounds(x, y, z)) return BLOCK.AIR;
  return world[indexFrom(x, y, z)];
}

function setBlock(x, y, z, id) {
  if (!inBounds(x, y, z)) return;
  world[indexFrom(x, y, z)] = id;
}

function hash2d(x, z) {
  const s = Math.sin(x * 127.1 + z * 311.7) * 43758.5453123;
  return s - Math.floor(s);
}

function valueNoise2D(x, z) {
  const xi = Math.floor(x);
  const zi = Math.floor(z);
  const xf = x - xi;
  const zf = z - zi;

  const a = hash2d(xi, zi);
  const b = hash2d(xi + 1, zi);
  const c = hash2d(xi, zi + 1);
  const d = hash2d(xi + 1, zi + 1);

  const u = xf * xf * (3 - 2 * xf);
  const v = zf * zf * (3 - 2 * zf);

  const ab = a + (b - a) * u;
  const cd = c + (d - c) * u;
  return ab + (cd - ab) * v;
}

function fbm(x, z) {
  let amplitude = 1;
  let frequency = 1;
  let sum = 0;
  let max = 0;

  for (let i = 0; i < 5; i += 1) {
    sum += valueNoise2D(x * frequency, z * frequency) * amplitude;
    max += amplitude;
    amplitude *= 0.52;
    frequency *= 2.08;
  }

  return sum / max;
}

function generateWorld() {
  for (let x = 0; x < worldSize.x; x += 1) {
    for (let z = 0; z < worldSize.z; z += 1) {
      const hills = fbm(x * 0.03, z * 0.03);
      const bumps = fbm(x * 0.11 + 80, z * 0.11 + 120) * 0.4;
      const height = Math.floor(8 + hills * 17 + bumps * 6);

      for (let y = 0; y < worldSize.y; y += 1) {
        if (y > height) {
          setBlock(x, y, z, BLOCK.AIR);
        } else if (y === height) {
          setBlock(x, y, z, y <= waterLevel + 1 ? BLOCK.SAND : BLOCK.GRASS);
        } else if (y > height - 3) {
          setBlock(x, y, z, BLOCK.DIRT);
        } else {
          setBlock(x, y, z, BLOCK.STONE);
        }
      }

      if (height > waterLevel + 2 && hash2d(x * 1.3, z * 1.9) > 0.84) {
        plantTree(x, height + 1, z);
      }
    }
  }
}

function plantTree(x, y, z) {
  const height = 3 + Math.floor(hash2d(x + 9, z - 19) * 3);

  for (let i = 0; i < height && y + i < worldSize.y - 1; i += 1) {
    setBlock(x, y + i, z, BLOCK.WOOD);
  }

  const top = y + height;
  for (let lx = -2; lx <= 2; lx += 1) {
    for (let lz = -2; lz <= 2; lz += 1) {
      for (let ly = -2; ly <= 1; ly += 1) {
        const dist = Math.abs(lx) + Math.abs(lz) + Math.abs(ly);
        if (dist < 5 && hash2d(x + lx * 3, z + lz * 5 + ly) > 0.15) {
          const wx = x + lx;
          const wy = top + ly;
          const wz = z + lz;
          if (inBounds(wx, wy, wz) && getBlock(wx, wy, wz) === BLOCK.AIR) {
            setBlock(wx, wy, wz, BLOCK.LEAVES);
          }
        }
      }
    }
  }
}

const atlasSize = 1024;
const tileSize = 64;
const tilesPerRow = atlasSize / tileSize;

const tileMap = {
  [BLOCK.GRASS]: { top: 0, side: 1, bottom: 2 },
  [BLOCK.DIRT]: { all: 2 },
  [BLOCK.STONE]: { all: 3 },
  [BLOCK.SAND]: { all: 4 },
  [BLOCK.WOOD]: { top: 5, side: 6, bottom: 5 },
  [BLOCK.LEAVES]: { all: 7 },
  [BLOCK.COBBLE]: { all: 8 },
  [BLOCK.PLANKS]: { all: 9 },
};

function makeAtlas() {
  const atlas = document.createElement('canvas');
  atlas.width = atlasSize;
  atlas.height = atlasSize;
  const ctx = atlas.getContext('2d');
  ctx.imageSmoothingEnabled = false;

  const pixel = (tile, x, y, color) => {
    const tx = (tile % tilesPerRow) * tileSize + x;
    const ty = Math.floor(tile / tilesPerRow) * tileSize + y;
    ctx.fillStyle = color;
    ctx.fillRect(tx, ty, 1, 1);
  };

  const fillTile = (tile, base, variation, accent = null) => {
    for (let y = 0; y < tileSize; y += 1) {
      for (let x = 0; x < tileSize; x += 1) {
        const n = hash2d(tile * 100 + x * 0.8, y * 1.4);
        const shade = Math.floor((n - 0.5) * variation);
        const rgb = base.map((channel) => Math.max(0, Math.min(255, channel + shade)));
        pixel(tile, x, y, `rgb(${rgb[0]}, ${rgb[1]}, ${rgb[2]})`);
      }
    }

    if (accent) {
      for (let i = 0; i < tileSize * 2.5; i += 1) {
        const x = Math.floor(hash2d(tile * 77 + i, i * 5) * tileSize);
        const y = Math.floor(hash2d(tile * 97 + i, i * 9) * tileSize);
        pixel(tile, x, y, accent);
      }
    }
  };

  fillTile(0, [80, 180, 70], 26, '#5da145');
  fillTile(1, [120, 94, 58], 34);
  fillTile(2, [124, 92, 63], 28);
  fillTile(3, [120, 120, 126], 35, '#9b9ba3');
  fillTile(4, [205, 191, 141], 18, '#ece1ab');
  fillTile(5, [176, 153, 100], 20);
  fillTile(6, [151, 112, 74], 30, '#8a5c2a');
  fillTile(7, [76, 145, 68], 40, '#4f8e44');
  fillTile(8, [125, 125, 125], 26, '#888');
  fillTile(9, [173, 130, 81], 26, '#a07342');

  const texture = new THREE.CanvasTexture(atlas);
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.NearestMipmapNearestFilter;
  texture.generateMipmaps = true;
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  return texture;
}

const atlasTexture = makeAtlas();
const worldMaterial = new THREE.MeshLambertMaterial({ map: atlasTexture, transparent: false });
const chunkGroup = new THREE.Group();
scene.add(chunkGroup);

const faceDefs = [
  { dir: [1, 0, 0], corners: [[1, 1, 0], [1, 0, 0], [1, 1, 1], [1, 0, 1]], face: 'side' },
  { dir: [-1, 0, 0], corners: [[0, 1, 1], [0, 0, 1], [0, 1, 0], [0, 0, 0]], face: 'side' },
  { dir: [0, 1, 0], corners: [[0, 1, 1], [1, 1, 1], [0, 1, 0], [1, 1, 0]], face: 'top' },
  { dir: [0, -1, 0], corners: [[0, 0, 0], [1, 0, 0], [0, 0, 1], [1, 0, 1]], face: 'bottom' },
  { dir: [0, 0, 1], corners: [[1, 1, 1], [1, 0, 1], [0, 1, 1], [0, 0, 1]], face: 'side' },
  { dir: [0, 0, -1], corners: [[0, 1, 0], [0, 0, 0], [1, 1, 0], [1, 0, 0]], face: 'side' },
];

let worldMesh;

function uvForTile(tileIndex) {
  const tx = tileIndex % tilesPerRow;
  const ty = Math.floor(tileIndex / tilesPerRow);
  const pad = 0.001;
  const u0 = tx / tilesPerRow + pad;
  const v0 = 1 - (ty + 1) / tilesPerRow + pad;
  const u1 = (tx + 1) / tilesPerRow - pad;
  const v1 = 1 - ty / tilesPerRow - pad;

  return [
    [u0, v1],
    [u0, v0],
    [u1, v1],
    [u1, v0],
  ];
}

function rebuildWorldMesh() {
  if (worldMesh) {
    worldMesh.geometry.dispose();
    chunkGroup.remove(worldMesh);
  }

  const positions = [];
  const normals = [];
  const uvs = [];
  const indices = [];

  let indexOffset = 0;

  for (let x = 0; x < worldSize.x; x += 1) {
    for (let y = 0; y < worldSize.y; y += 1) {
      for (let z = 0; z < worldSize.z; z += 1) {
        const block = getBlock(x, y, z);
        if (block === BLOCK.AIR) continue;

        const tileInfo = tileMap[block];

        for (const face of faceDefs) {
          const nx = x + face.dir[0];
          const ny = y + face.dir[1];
          const nz = z + face.dir[2];
          if (getBlock(nx, ny, nz) !== BLOCK.AIR) continue;

          const tile = tileInfo[face.face] ?? tileInfo.all;
          const uv = uvForTile(tile);

          for (let i = 0; i < 4; i += 1) {
            const corner = face.corners[i];
            positions.push(x + corner[0], y + corner[1], z + corner[2]);
            normals.push(...face.dir);
            uvs.push(...uv[i]);
          }

          indices.push(indexOffset, indexOffset + 1, indexOffset + 2, indexOffset + 2, indexOffset + 1, indexOffset + 3);
          indexOffset += 4;
        }
      }
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeBoundingSphere();

  worldMesh = new THREE.Mesh(geometry, worldMaterial);
  worldMesh.castShadow = false;
  worldMesh.receiveShadow = true;
  chunkGroup.add(worldMesh);
}

const ambient = new THREE.AmbientLight(0xbad1ff, 0.58);
scene.add(ambient);

const sunlight = new THREE.DirectionalLight(0xfff0d6, 1.35);
sunlight.position.set(-30, 60, 14);
sunlight.castShadow = true;
sunlight.shadow.mapSize.set(2048, 2048);
sunlight.shadow.camera.near = 1;
sunlight.shadow.camera.far = 220;
sunlight.shadow.camera.left = -80;
sunlight.shadow.camera.right = 80;
sunlight.shadow.camera.bottom = -80;
sunlight.shadow.camera.top = 80;
scene.add(sunlight);

const selectionOutline = new THREE.LineSegments(
  new THREE.EdgesGeometry(new THREE.BoxGeometry(1.02, 1.02, 1.02)),
  new THREE.LineBasicMaterial({ color: 0xffffff })
);
selectionOutline.visible = false;
scene.add(selectionOutline);

const pointer = {
  locked: false,
  yaw: 0,
  pitch: 0,
};

const player = {
  radius: 0.35,
  height: 1.72,
  eyeHeight: 1.62,
  position: new THREE.Vector3(worldSize.x / 2, 30, worldSize.z / 2),
  velocity: new THREE.Vector3(),
  onGround: false,
};

const movement = {
  forward: false,
  backward: false,
  left: false,
  right: false,
  jump: false,
  sprint: false,
  sneak: false,
};

function playerAABB(pos = player.position) {
  return {
    minX: pos.x - player.radius,
    maxX: pos.x + player.radius,
    minY: pos.y,
    maxY: pos.y + player.height,
    minZ: pos.z - player.radius,
    maxZ: pos.z + player.radius,
  };
}

function collidesAt(pos) {
  const aabb = playerAABB(pos);
  const minX = Math.floor(aabb.minX);
  const maxX = Math.floor(aabb.maxX);
  const minY = Math.floor(aabb.minY);
  const maxY = Math.floor(aabb.maxY);
  const minZ = Math.floor(aabb.minZ);
  const maxZ = Math.floor(aabb.maxZ);

  for (let x = minX; x <= maxX; x += 1) {
    for (let y = minY; y <= maxY; y += 1) {
      for (let z = minZ; z <= maxZ; z += 1) {
        if (getBlock(x, y, z) !== BLOCK.AIR) {
          return true;
        }
      }
    }
  }

  return false;
}

function tryMoveAxis(axis, delta) {
  player.position[axis] += delta;
  if (collidesAt(player.position)) {
    player.position[axis] -= delta;
    player.velocity[axis] = 0;
    return false;
  }
  return true;
}

function updatePlayer(dt) {
  const yaw = pointer.yaw;
  const forward = new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw));
  const right = new THREE.Vector3(forward.z, 0, -forward.x);

  const desired = new THREE.Vector3();
  if (movement.forward) desired.add(forward);
  if (movement.backward) desired.sub(forward);
  if (movement.left) desired.sub(right);
  if (movement.right) desired.add(right);

  if (desired.lengthSq() > 0) desired.normalize();

  const speed = movement.sprint ? 8.2 : 5.2;
  const sneakMultiplier = movement.sneak ? 0.42 : 1;
  const groundAcceleration = 20;
  const airAcceleration = 9;

  const targetVX = desired.x * speed * sneakMultiplier;
  const targetVZ = desired.z * speed * sneakMultiplier;
  const accel = player.onGround ? groundAcceleration : airAcceleration;

  player.velocity.x += (targetVX - player.velocity.x) * Math.min(1, accel * dt);
  player.velocity.z += (targetVZ - player.velocity.z) * Math.min(1, accel * dt);

  if (player.onGround && movement.jump) {
    player.velocity.y = 7.8;
    player.onGround = false;
  }

  player.velocity.y -= 20 * dt;

  player.onGround = false;
  tryMoveAxis('x', player.velocity.x * dt);
  tryMoveAxis('z', player.velocity.z * dt);

  const movedY = tryMoveAxis('y', player.velocity.y * dt);
  if (!movedY && player.velocity.y <= 0) {
    player.onGround = true;
  }

  const eye = new THREE.Vector3(player.position.x, player.position.y + player.eyeHeight, player.position.z);
  camera.position.copy(eye);
  camera.rotation.order = 'YXZ';
  camera.rotation.y = pointer.yaw;
  camera.rotation.x = pointer.pitch;
}

const raycaster = new THREE.Raycaster();
raycaster.far = 7;
let hoveredCell = null;
let hoveredNormal = null;

function updateHover() {
  const direction = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
  raycaster.set(camera.position, direction);

  if (!worldMesh) {
    selectionOutline.visible = false;
    hoveredCell = null;
    hoveredNormal = null;
    return;
  }

  const hits = raycaster.intersectObject(worldMesh, false);
  if (!hits.length) {
    selectionOutline.visible = false;
    hoveredCell = null;
    hoveredNormal = null;
    return;
  }

  const hit = hits[0];
  const normal = hit.face.normal.clone().round();
  const point = hit.point.clone().addScaledVector(normal, -0.01);
  const cell = point.floor();

  hoveredCell = cell;
  hoveredNormal = normal;

  selectionOutline.visible = true;
  selectionOutline.position.set(cell.x + 0.5, cell.y + 0.5, cell.z + 0.5);
}

function canPlaceAt(x, y, z) {
  if (!inBounds(x, y, z) || getBlock(x, y, z) !== BLOCK.AIR) return false;

  const testPos = player.position.clone();
  const aabb = playerAABB(testPos);
  const blockAABB = {
    minX: x,
    maxX: x + 1,
    minY: y,
    maxY: y + 1,
    minZ: z,
    maxZ: z + 1,
  };

  const overlap =
    aabb.minX < blockAABB.maxX &&
    aabb.maxX > blockAABB.minX &&
    aabb.minY < blockAABB.maxY &&
    aabb.maxY > blockAABB.minY &&
    aabb.minZ < blockAABB.maxZ &&
    aabb.maxZ > blockAABB.minZ;

  return !overlap;
}

function mineBlock() {
  if (!hoveredCell) return;
  if (getBlock(hoveredCell.x, hoveredCell.y, hoveredCell.z) === BLOCK.AIR) return;
  setBlock(hoveredCell.x, hoveredCell.y, hoveredCell.z, BLOCK.AIR);
  rebuildWorldMesh();
}

function placeBlock() {
  if (!hoveredCell || !hoveredNormal) return;
  const target = hoveredCell.clone().add(hoveredNormal);
  if (!canPlaceAt(target.x, target.y, target.z)) return;
  const selectedBlock = blockCatalog[selectedSlot].id;
  setBlock(target.x, target.y, target.z, selectedBlock);
  rebuildWorldMesh();
}

function syncHotbar() {
  hotbar.innerHTML = '';
  blockCatalog.forEach((entry, index) => {
    const slot = document.createElement('div');
    slot.className = `hotbar-slot ${index === selectedSlot ? 'active' : ''}`;
    slot.innerHTML = `<strong>${index + 1}</strong><span>${entry.name}</span>`;
    hotbar.appendChild(slot);
  });
}

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

canvas.addEventListener('click', () => {
  if (!pointer.locked) {
    canvas.requestPointerLock();
  }
});

document.addEventListener('pointerlockchange', () => {
  pointer.locked = document.pointerLockElement === canvas;
  helpPanel.classList.toggle('hidden', pointer.locked);
});

document.addEventListener('mousemove', (event) => {
  if (!pointer.locked) return;
  const sensitivity = 0.0022;
  pointer.yaw -= event.movementX * sensitivity;
  pointer.pitch -= event.movementY * sensitivity;
  pointer.pitch = Math.max(-Math.PI / 2 + 0.02, Math.min(Math.PI / 2 - 0.02, pointer.pitch));
});

window.addEventListener('keydown', (event) => {
  switch (event.code) {
    case 'KeyW': movement.forward = true; break;
    case 'KeyS': movement.backward = true; break;
    case 'KeyA': movement.left = true; break;
    case 'KeyD': movement.right = true; break;
    case 'Space': movement.jump = true; break;
    case 'ControlLeft': movement.sprint = true; break;
    case 'ShiftLeft': movement.sneak = true; break;
    default:
      if (/Digit[1-8]/.test(event.code)) {
        selectedSlot = Number(event.code.slice(-1)) - 1;
        syncHotbar();
      }
      break;
  }
});

window.addEventListener('keyup', (event) => {
  switch (event.code) {
    case 'KeyW': movement.forward = false; break;
    case 'KeyS': movement.backward = false; break;
    case 'KeyA': movement.left = false; break;
    case 'KeyD': movement.right = false; break;
    case 'Space': movement.jump = false; break;
    case 'ControlLeft': movement.sprint = false; break;
    case 'ShiftLeft': movement.sneak = false; break;
    default: break;
  }
});

window.addEventListener('wheel', (event) => {
  if (event.deltaY > 0) {
    selectedSlot = (selectedSlot + 1) % blockCatalog.length;
  } else {
    selectedSlot = (selectedSlot - 1 + blockCatalog.length) % blockCatalog.length;
  }
  syncHotbar();
}, { passive: true });

window.addEventListener('mousedown', (event) => {
  if (!pointer.locked) return;
  if (event.button === 0) {
    mineBlock();
  } else if (event.button === 2) {
    placeBlock();
  }
});

window.addEventListener('contextmenu', (event) => event.preventDefault());

function updateSky(time) {
  const dayCycle = (time * 0.02) % (Math.PI * 2);
  const sunHeight = Math.sin(dayCycle);
  sunlight.position.set(Math.cos(dayCycle) * 70, Math.max(8, sunHeight * 70), Math.sin(dayCycle) * 32);
  sunlight.intensity = 0.5 + Math.max(0, sunHeight) * 1.1;
  ambient.intensity = 0.3 + Math.max(0, sunHeight) * 0.45;

  const skyNight = new THREE.Color(0x0f1630);
  const skyDay = new THREE.Color(0x8ac0ff);
  scene.fog.color.copy(skyNight).lerp(skyDay, Math.max(0, sunHeight));
  scene.background = scene.fog.color;
}

function updateStats() {
  const pos = player.position;
  const block = blockCatalog[selectedSlot];
  statsPanel.textContent = `XYZ: ${pos.x.toFixed(1)} ${pos.y.toFixed(1)} ${pos.z.toFixed(1)}\nBlock: ${block.name}\nGround: ${player.onGround ? 'yes' : 'no'}`;
}

function animate() {
  const dt = Math.min(clock.getDelta(), 0.05);
  const elapsed = clock.elapsedTime;

  updatePlayer(dt);
  updateHover();
  updateSky(elapsed);
  updateStats();

  renderer.render(scene, camera);
  requestAnimationFrame(animate);
}

generateWorld();
rebuildWorldMesh();
syncHotbar();

player.position.set(worldSize.x / 2 + 0.5, 28, worldSize.z / 2 + 0.5);
pointer.yaw = Math.PI;

animate();
