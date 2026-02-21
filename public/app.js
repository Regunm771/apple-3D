import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.161.0/build/three.module.js';
import { OrbitControls } from 'https://cdn.jsdelivr.net/npm/three@0.161.0/examples/jsm/controls/OrbitControls.js';

const state = {
  sensors: { temperature: 0, humidity: 0, ethylene: 0, gas: 0 },
  deviceState: { fan: false, humidifier: false, infraredCamera: true },
  trays: [],
  trend: {
    labels: [],
    temperature: [],
    humidity: [],
    ethylene: [],
    gas: [],
  },
};

const trayMeshes = new Map();
let heatFog;
let lineChart;
let radarChart;

initTabs();
initCharts();
initScene();
initPolling();
renderPanel();

function initTabs() {
  document.querySelectorAll('.tab').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab').forEach((item) => item.classList.remove('active'));
      document.querySelectorAll('.page').forEach((page) => page.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById(btn.dataset.page).classList.add('active');
    });
  });
}

function initCharts() {
  lineChart = echarts.init(document.getElementById('lineChart'));
  radarChart = echarts.init(document.getElementById('radarChart'));
  updateCharts();
  window.addEventListener('resize', () => {
    lineChart.resize();
    radarChart.resize();
  });
}

function pushTrend(ts) {
  const t = new Date(ts).toLocaleTimeString();
  const keys = ['labels', 'temperature', 'humidity', 'ethylene', 'gas'];
  keys.forEach((key) => {
    if (state.trend[key].length >= 20) state.trend[key].shift();
  });
  state.trend.labels.push(t);
  state.trend.temperature.push(state.sensors.temperature);
  state.trend.humidity.push(state.sensors.humidity);
  state.trend.ethylene.push(state.sensors.ethylene);
  state.trend.gas.push(state.sensors.gas);
}

function updateCharts() {
  lineChart.setOption({
    backgroundColor: 'transparent',
    tooltip: { trigger: 'axis' },
    legend: { textStyle: { color: '#cfe1ff' } },
    xAxis: { type: 'category', data: state.trend.labels, axisLabel: { color: '#cfe1ff' } },
    yAxis: { type: 'value', axisLabel: { color: '#cfe1ff' } },
    series: [
      { name: '温度', type: 'line', data: state.trend.temperature, smooth: true },
      { name: '湿度', type: 'line', data: state.trend.humidity, smooth: true },
      { name: '乙烯', type: 'line', data: state.trend.ethylene, smooth: true },
      { name: '气体', type: 'line', data: state.trend.gas, smooth: true },
    ],
  });

  radarChart.setOption({
    tooltip: {},
    radar: {
      indicator: [
        { name: '温度', max: 10 },
        { name: '湿度', max: 100 },
        { name: '乙烯', max: 80 },
        { name: '气体', max: 80 },
      ],
      splitArea: { areaStyle: { color: ['#10233f', '#0c1b32'] } },
      axisName: { color: '#d2e5ff' },
    },
    series: [{
      type: 'radar',
      data: [{ value: [state.sensors.temperature, state.sensors.humidity, state.sensors.ethylene, state.sensors.gas], name: '环境状态' }],
      areaStyle: { color: 'rgba(78, 205, 196, 0.4)' },
    }],
  });
}

function initScene() {
  const canvas = document.getElementById('warehouseScene');
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#02080f');

  const camera = new THREE.PerspectiveCamera(55, canvas.clientWidth / canvas.clientHeight, 0.1, 200);
  camera.position.set(11, 8, 11);

  const controls = new OrbitControls(camera, canvas);
  controls.target.set(0, 1.6, 0);
  controls.update();

  const amb = new THREE.AmbientLight(0xffffff, 0.7);
  const dir = new THREE.DirectionalLight(0x9fd5ff, 1.2);
  dir.position.set(6, 12, 4);
  scene.add(amb, dir);

  const floor = new THREE.Mesh(new THREE.BoxGeometry(16, 0.3, 16), new THREE.MeshStandardMaterial({ color: '#6f7d8f', metalness: 0.3, roughness: 0.75 }));
  floor.position.y = -0.15;
  scene.add(floor);

  buildRacks(scene);
  buildSensors(scene);
  buildFan(scene);
  heatFog = new THREE.Mesh(
    new THREE.SphereGeometry(3.2, 32, 32),
    new THREE.MeshBasicMaterial({ color: '#eab43f', transparent: true, opacity: 0.05 })
  );
  heatFog.position.set(0, 2.2, 0);
  scene.add(heatFog);

  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();

  canvas.addEventListener('click', (event) => {
    const rect = canvas.getBoundingClientRect();
    pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(pointer, camera);
    const intersects = raycaster.intersectObjects(scene.children, true);
    const fanHit = intersects.find((hit) => hit.object.userData.device === 'fan');
    if (fanHit) {
      toggleDevice('fan');
    }
  });

  function animate() {
    const { clientWidth, clientHeight } = canvas;
    if (canvas.width !== clientWidth || canvas.height !== clientHeight) {
      renderer.setSize(clientWidth, clientHeight, false);
      camera.aspect = clientWidth / clientHeight;
      camera.updateProjectionMatrix();
    }

    const pulse = Math.sin(Date.now() * 0.006) * 0.15 + 0.85;
    trayMeshes.forEach((mesh) => {
      if (mesh.userData.alert) {
        mesh.material.emissiveIntensity = pulse;
      }
    });

    renderer.render(scene, camera);
    requestAnimationFrame(animate);
  }
  animate();
}

function buildRacks(scene) {
  const rackMaterial = new THREE.MeshStandardMaterial({ color: '#3f4e62', metalness: 0.8, roughness: 0.3 });
  for (let i = -1; i <= 1; i += 2) {
    const rack = new THREE.Mesh(new THREE.BoxGeometry(0.4, 3.5, 10), rackMaterial);
    rack.position.set(i * 3.4, 1.75, 0);
    scene.add(rack);
  }

  const basketMaterial = new THREE.MeshStandardMaterial({ color: '#95694a', roughness: 0.7 });
  const appleMaterial = new THREE.MeshStandardMaterial({ color: '#c3372e', roughness: 0.5 });
  for (let i = 0; i < 8; i++) {
    const x = i < 4 ? -2 : 2;
    const z = -3.6 + (i % 4) * 2.4;

    const tray = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.4, 1.2), basketMaterial.clone());
    tray.position.set(x, 1.1, z);
    tray.material.emissive = new THREE.Color('#000000');
    scene.add(tray);
    trayMeshes.set(i + 1, tray);

    for (let a = 0; a < 5; a++) {
      const apple = new THREE.Mesh(new THREE.SphereGeometry(0.16, 16, 16), appleMaterial);
      apple.position.set(x + (Math.random() - 0.5) * 0.9, 1.38, z + (Math.random() - 0.5) * 0.5);
      scene.add(apple);
    }

    const card = new THREE.Mesh(new THREE.PlaneGeometry(0.4, 0.3), new THREE.MeshBasicMaterial({ color: '#c7d8e7' }));
    card.position.set(x + 0.55, 1.39, z);
    card.rotation.x = -Math.PI / 2;
    scene.add(card);
  }
}

function buildSensors(scene) {
  const cameraBody = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.3, 0.3), new THREE.MeshStandardMaterial({ color: '#7e8da3', metalness: 0.6 }));
  cameraBody.position.set(-6.5, 3.8, 0);
  scene.add(cameraBody);

  const irCamera = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.5, 16), new THREE.MeshStandardMaterial({ color: '#84a5ff' }));
  irCamera.rotation.z = Math.PI / 2;
  irCamera.position.set(6.2, 3.7, 0);
  scene.add(irCamera);

  const sensorBox = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.4, 0.4), new THREE.MeshStandardMaterial({ color: '#77ad97' }));
  sensorBox.position.set(0, 2.1, -5.2);
  scene.add(sensorBox);

  const jetson = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.2, 1.1), new THREE.MeshStandardMaterial({ color: '#2f3f70' }));
  jetson.position.set(0, 0.25, 5.5);
  scene.add(jetson);
}

function buildFan(scene) {
  const fan = new THREE.Group();
  const outer = new THREE.Mesh(new THREE.TorusGeometry(0.65, 0.08, 8, 20), new THREE.MeshStandardMaterial({ color: '#9ba8b8', metalness: 0.8 }));
  outer.rotation.x = Math.PI / 2;
  fan.add(outer);

  for (let i = 0; i < 3; i++) {
    const blade = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.6, 0.12), new THREE.MeshStandardMaterial({ color: '#6f7f94' }));
    blade.position.y = 0.25;
    blade.rotation.z = (Math.PI * 2 * i) / 3;
    fan.add(blade);
  }
  fan.position.set(0, 3.7, 6.6);
  fan.userData.device = 'fan';
  fan.traverse((obj) => {
    obj.userData.device = 'fan';
  });
  scene.add(fan);
}

function renderPanel() {
  const panel = document.getElementById('devicePanel');
  const devices = [
    { key: 'fan', label: '排风扇' },
    { key: 'humidifier', label: '温湿度调节器' },
    { key: 'infraredCamera', label: '红外相机' },
  ];

  panel.innerHTML = devices
    .map((d) => `
      <article class="device-card">
        <h3>${d.label}</h3>
        <p>状态：<strong>${state.deviceState[d.key] ? '开启' : '关闭'}</strong></p>
        <button data-device="${d.key}">${state.deviceState[d.key] ? '关闭' : '开启'}${d.label}</button>
      </article>
    `)
    .join('');

  panel.querySelectorAll('button').forEach((btn) => {
    btn.addEventListener('click', () => toggleDevice(btn.dataset.device));
  });
}

async function toggleDevice(device) {
  const feedback = document.getElementById('feedback');
  feedback.textContent = `${device} 指令发送中...`;
  const res = await fetch(`/api/device/${device}/toggle`, { method: 'POST' });
  if (!res.ok) {
    feedback.textContent = `${device} 指令失败`;
    return;
  }
  const result = await res.json();
  feedback.textContent = result.message;
}

function initPolling() {
  const pull = async () => {
    try {
      const res = await fetch('/api/state');
      if (!res.ok) return;
      const payload = await res.json();
      state.sensors = payload.sensors;
      state.deviceState = payload.deviceState;
      state.trays = payload.trays;

      pushTrend(payload.ts || Date.now());
      updateCharts();
      renderPanel();
      updateSceneByData();
      updateWarnings();
    } catch (error) {
      document.getElementById('feedback').textContent = '数据拉取失败，请检查服务状态。';
    }
  };

  pull();
  setInterval(pull, 2000);
}

function updateSceneByData() {
  const ethylene = state.sensors.ethylene;
  heatFog.material.opacity = Math.min(0.5, Math.max(0.05, ethylene / 100));

  state.trays.forEach((tray) => {
    const mesh = trayMeshes.get(tray.id);
    if (!mesh) return;
    const alert = tray.spoilage >= 0.8;
    mesh.userData.alert = alert;
    mesh.material.color.set(alert ? '#8a1f1f' : '#95694a');
    mesh.material.emissive.set(alert ? '#ff3d3d' : '#000000');
  });
}

function updateWarnings() {
  const warningList = document.getElementById('warningList');
  const alertTrays = state.trays.filter((tray) => tray.spoilage >= 0.8);
  warningList.innerHTML = alertTrays.length
    ? alertTrays
        .map((tray) => `<li class="warning-item">果筐 #${tray.id} 腐败概率 ${(tray.spoilage * 100).toFixed(1)}%，建议立即排风并人工检查。</li>`)
        .join('')
    : '<li>当前无高风险果筐，系统运行稳定。</li>';

  if (alertTrays.length) {
    const audio = document.getElementById('alarmAudio');
    audio.play().catch(() => {});
  }
}
