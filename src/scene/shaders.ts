import * as THREE from 'three';

const GLSL_FAST_SKY = /* glsl */ `
  vec3 hash33(vec3 p3) {
    p3 = fract(p3 * vec3(0.1031, 0.1030, 0.0973));
    p3 += dot(p3, p3.yxz + 33.33);
    return fract((p3.xxy + p3.yxx) * p3.zyx);
  }

  float hash13(vec3 p3) {
    p3 = fract(p3 * 0.1031);
    p3 += dot(p3, p3.zyx + 31.32);
    return fract((p3.x + p3.y) * p3.z);
  }

  float fbm3Fast(vec3 p) {
    float v = 0.0;
    float amp = 0.52;
    for (int i = 0; i < 3; i++) {
      vec3 iCell = floor(p);
      vec3 f = fract(p);
      vec3 u = f * f * (3.0 - 2.0 * f);
      float n000 = hash13(iCell);
      float n100 = hash13(iCell + vec3(1.0, 0.0, 0.0));
      float n010 = hash13(iCell + vec3(0.0, 1.0, 0.0));
      float n110 = hash13(iCell + vec3(1.0, 1.0, 0.0));
      float n001 = hash13(iCell + vec3(0.0, 0.0, 1.0));
      float n101 = hash13(iCell + vec3(1.0, 0.0, 1.0));
      float n011 = hash13(iCell + vec3(0.0, 1.0, 1.0));
      float n111 = hash13(iCell + vec3(1.0, 1.0, 1.0));
      float nx00 = mix(n000, n100, u.x);
      float nx10 = mix(n010, n110, u.x);
      float nx01 = mix(n001, n101, u.x);
      float nx11 = mix(n011, n111, u.x);
      v += amp * mix(mix(nx00, nx10, u.y), mix(nx01, nx11, u.y), u.z);
      p = p * 2.04 + vec3(7.3, 13.7, 5.1);
      amp *= 0.5;
    }
    return v;
  }
`;

export function createRelativisticBlackHoleMaterial(uniforms: {
  uTime: { value: number };
  uSpectrumWeights: { value: THREE.Vector2 };
  uDirectTonemap: { value: number };
  uObserverRedshift: { value: number };
  uNoiseTex: { value: THREE.DataTexture };
}): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms,
    vertexShader: /* glsl */ `
      varying vec3 vWorldPos;
      void main() {
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vWorldPos = wp.xyz;
        gl_Position = projectionMatrix * viewMatrix * wp;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uTime;
      uniform vec2 uSpectrumWeights;
      uniform float uDirectTonemap;
      uniform float uObserverRedshift;
      uniform sampler2D uNoiseTex;
      varying vec3 vWorldPos;

      ${GLSL_FAST_SKY}

      // Exact Schwarzschild metric (r_s = 1.0, photon sphere = 1.5, shadow b_crit = 2.598)
      const float R_S = 1.0;
      const float R_HORIZON = 1.015;
      const float R_DISK_IN = 1.88;
      const float R_PLUNGE_MIN = 1.46;
      const float R_DISK_OUT = 9.2;
      const float R_BOUND = 20.0;

      const vec3 DISK_N = vec3(0.055, 0.996, -0.068);
      const vec3 DISK_U = vec3(0.998, -0.055, 0.000);
      const vec3 DISK_V = vec3(0.004, 0.068, 0.998);

      vec3 acesFilm(vec3 x) {
        const float a = 2.51;
        const float b = 0.03;
        const float c = 2.43;
        const float d = 0.59;
        const float e = 0.14;
        return clamp((x * (a * x + b)) / (x * (c * x + d) + e), 0.0, 1.0);
      }

      // Smooth branchless spectral morph: Natural/Amber -> ionized violet bridge -> Electric X-Ray
      vec3 mapAccretionPalette(float heat, float dopplerBoost, float localXray) {
        float obsHeat = heat * uObserverRedshift;
        float proxShift = clamp((1.0 - uObserverRedshift) * 2.1, 0.0, 0.36);

        vec3 ember = vec3(0.065, 0.008, 0.002);
        vec3 deepOrange = vec3(0.45, 0.09, 0.012);
        vec3 fieryAmber = vec3(0.92, 0.34, 0.052);
        vec3 moltenGold = mix(vec3(1.18, 0.72, 0.24), vec3(1.14, 0.60, 0.16), uSpectrumWeights.x);
        vec3 warmIvory = mix(vec3(1.44, 1.20, 0.90), vec3(1.36, 1.06, 0.70), uSpectrumWeights.x);

        float h = clamp(obsHeat * (0.68 + 0.38 * dopplerBoost), 0.0, 1.25);
        vec3 cWarm = mix(ember, deepOrange, smoothstep(0.03, 0.26, h));
        cWarm = mix(cWarm, fieryAmber, smoothstep(0.24, 0.54, h));
        cWarm = mix(cWarm, moltenGold, smoothstep(0.52, 0.85, h));
        cWarm = mix(cWarm, warmIvory, smoothstep(0.83, 1.18, h));
        cWarm = mix(cWarm, vec3(cWarm.r * 1.05, cWarm.g * 0.82, cWarm.b * 0.64), proxShift);

        vec3 qDark = vec3(0.04, 0.015, 0.13);
        vec3 qMid = vec3(0.12, 0.44, 1.02);
        vec3 qHot = vec3(0.96, 1.14, 1.40);
        vec3 cXray = mix(qDark, qMid, smoothstep(0.06, 0.56, obsHeat));
        cXray = mix(cXray, qHot, smoothstep(0.56, 1.02, obsHeat * dopplerBoost));
        cXray = mix(cXray, vec3(cXray.r * 1.06, cXray.g * 0.80, cXray.b * 0.92), proxShift * 0.6);

        float bridge = 4.0 * localXray * (1.0 - localXray);
        vec3 ionViolet = vec3(0.82, 0.20, 0.96) * clamp(obsHeat * 1.12, 0.16, 1.32);
        vec3 c = mix(cWarm, cXray, localXray);
        return mix(c, max(c, ionViolet), bridge * 0.46);
      }

      vec3 evalDeepSpace(vec3 dir) {
        vec3 d = normalize(dir);
        vec3 col = vec3(0.0002, 0.0002, 0.0004);

        float xrayMix = uSpectrumWeights.y;
        float mwMix = mix(1.0, 0.15, uSpectrumWeights.x) * mix(1.0, 0.42, xrayMix);
        if (mwMix > 0.01) {
          float lat = dot(d, normalize(vec3(0.28, 0.88, -0.38)));
          float band = exp(-abs(lat) * 5.2);
          float n1 = fbm3Fast(d * 3.8 + vec3(1.4, 0.5, 2.2));
          float rift = smoothstep(0.40, 0.74, fbm3Fast(d * 9.5 + vec3(3.1)));

          vec3 warmMw = mix(vec3(0.006, 0.009, 0.016), vec3(0.019, 0.014, 0.010), n1);
          vec3 coolMw = mix(vec3(0.005, 0.008, 0.022), vec3(0.014, 0.012, 0.028), n1);
          vec3 mwCol = mix(warmMw, coolMw, xrayMix);
          col += mwCol * band * smoothstep(0.28, 0.82, n1) * (1.0 - rift * 0.76) * 0.78 * mwMix;
        }

        for (int layer = 0; layer < 3; layer++) {
          float scale = layer == 0 ? 40.0 : (layer == 1 ? 84.0 : 156.0);
          vec3 p = d * scale;
          vec3 cell = floor(p);
          vec3 f = fract(p) - 0.5;
          vec3 rnd = hash33(cell + float(layer) * 67.0);

          float thresh = layer == 0 ? 0.865 : (layer == 1 ? 0.83 : 0.81);
          if (rnd.x > thresh) {
            vec3 offset = (rnd - 0.5) * 0.66;
            float dist = length(f - offset);

            float sigma = layer == 0 ? 0.048 : (layer == 1 ? 0.036 : 0.026);
            float core = exp(-(dist * dist) / (sigma * sigma));
            float halo = exp(-dist * 22.0) * 0.14;

            vec3 starWarm = mix(vec3(1.0, 0.78, 0.58), vec3(0.76, 0.88, 1.0), rnd.y);
            vec3 starXray = mix(vec3(0.76, 0.84, 1.0), vec3(0.68, 0.94, 1.0), rnd.y);
            vec3 starCol = mix(starWarm, starXray, xrayMix * 0.65);

            float lum = layer == 0
              ? (0.55 + 1.35 * pow(rnd.z, 2.6))
              : (layer == 1 ? 0.32 + 0.50 * rnd.z : 0.15 + 0.24 * rnd.z);
            float twinkle = 0.94 + 0.06 * sin(uTime * (0.9 + rnd.y * 1.4) + rnd.z * 6.28);

            col += starCol * (core + halo) * lum * twinkle;
          }
        }

        return col;
      }

      float diskHalfHeight(float r) {
        return 0.018 + 0.015 * pow(max(r - R_PLUNGE_MIN, 0.0), 0.78);
      }

      // Dynamic Keplerian shear + radial inward infall + ISCO shear flares (zero extra texture fetches)
      void evalDiskSample(
        float uCoord,
        float vCoord,
        float r,
        float vertWeight,
        vec3 vel,
        float pathDs,
        inout vec3 accumCol,
        inout float transmittance
      ) {
        if (r < R_PLUNGE_MIN || r > R_DISK_OUT || vertWeight < 0.005) return;

        float innerMask = smoothstep(R_PLUNGE_MIN, R_DISK_IN + 0.22, r);
        float outerMask = 1.0 - smoothstep(4.2, R_DISK_OUT, r);
        float radialMask = innerMask * outerMask;
        if (radialMask < 0.004) return;

        float angle = atan(vCoord, uCoord);
        // Vigorous Keplerian differential rotation + active inward radial infall
        float omega = 2.45 / pow(max(r, 1.18), 1.28);
        float logR = log(max(r, 1.08));
        float radialInfall = uTime * 0.16;
        vec2 pLocal = vec2(uCoord, vCoord);

        float spiral1 = 2.25 * (logR + radialInfall) - uTime * omega;
        float ct1 = cos(spiral1);
        float st1 = sin(spiral1);
        vec2 adv1 = vec2(pLocal.x * ct1 - pLocal.y * st1, pLocal.x * st1 + pLocal.y * ct1);

        float spiral2 = 3.85 * (logR + radialInfall * 1.55) - uTime * (omega * 1.38);
        float ct2 = cos(spiral2);
        float st2 = sin(spiral2);
        vec2 adv2 = vec2(pLocal.x * ct2 - pLocal.y * st2, pLocal.x * st2 + pLocal.y * ct2);

        vec4 texWarp = texture2D(uNoiseTex, adv1 * 0.048 + vec2(0.13, 0.37) + vec2(uTime * 0.018, -uTime * 0.012));
        vec2 warp = (texWarp.ra - 0.5) * 0.16;

        vec4 texMain = texture2D(uNoiseTex, adv1 * 0.072 + warp);
        vec4 texFine = texture2D(uNoiseTex, adv2 * 0.165 + warp * 0.90 + vec2(0.41, 0.19));

        float plasma = smoothstep(0.20, 0.82, texMain.r * 0.42 + texMain.g * 0.34 + texFine.b * 0.30);
        float dustCanyon = smoothstep(0.38, 0.74, texMain.a * 0.65 + texWarp.g * 0.35);

        // ISCO inner-rim shear flares (reuses already-fetched noise channels)
        float shearZone = smoothstep(R_PLUNGE_MIN, R_DISK_IN + 0.15, r) * (1.0 - smoothstep(2.15, 3.25, r));
        float shearFlare = pow(smoothstep(0.56, 0.92, texFine.r * texMain.g * 1.52), 2.4) * shearZone;

        float plungeOpacity = mix(0.28, 1.0, smoothstep(R_PLUNGE_MIN, R_DISK_IN + 0.14, r));

        // Relativistic Doppler beaming + gravitational redshift
        vec3 orbitalTangent = normalize(-sin(angle) * DISK_U + cos(angle) * DISK_V);
        vec3 radialInward = normalize(-uCoord * DISK_U - vCoord * DISK_V);
        float plungeBlend = 1.0 - smoothstep(1.50, 2.30, r);
        vec3 flowDir = normalize(mix(orbitalTangent, normalize(orbitalTangent * 0.70 + radialInward * 0.71), plungeBlend));

        float beta = clamp(sqrt(R_S / max(2.0 * (r - R_S * 0.55), 0.38)) * 0.50, 0.05, 0.48);
        float gamma = inversesqrt(max(1.0 - beta * beta, 0.18));
        float cosTheta = dot(flowDir, -vel);
        float gravRed = sqrt(clamp(1.0 - R_S / max(r, R_S + 0.06), 0.05, 1.0));
        float gFactor = gravRed / (gamma * max(1.0 - beta * cosTheta, 0.40));

        float rNorm = clamp((r - R_DISK_IN) / (R_DISK_OUT - R_DISK_IN), 0.0, 1.0);
        float baseHeat = pow(1.0 - rNorm, 1.42) * (0.42 + 0.66 * plasma) + shearFlare * 0.46;
        if (r < R_DISK_IN) {
          baseHeat *= mix(0.55, 1.08, smoothstep(R_PLUNGE_MIN, R_DISK_IN, r));
        }

        // Inside-Out Thermal Wave
        float energyScore = clamp(baseHeat * 0.58 + (gFactor - 0.65) * 0.42 + (1.0 - rNorm) * 0.34, 0.0, 1.0);
        float waveEdge = mix(-0.02, 1.44, clamp(uSpectrumWeights.y, 0.0, 1.0));
        float localXray = 1.0 - smoothstep(waveEdge - 0.42, waveEdge, 1.0 - energyScore);

        float dustSuppression = mix(0.56, 0.12, localXray);
        float density = (0.04 + plasma * 1.20 + shearFlare * 0.65) * (1.0 - dustCanyon * dustSuppression) * radialMask * plungeOpacity * vertWeight;

        float beaming = pow(clamp(gFactor, 0.52, 1.48), 1.95);
        vec3 emitColor = mapAccretionPalette(baseHeat, clamp(gFactor, 0.62, 1.38), localXray);

        float plasmaExtinction = mix(11.5, 6.8, localXray);
        float dustExtinction = mix(4.2, 0.65, localXray);
        float opticalDensity = density * plasmaExtinction + dustCanyon * dustExtinction * radialMask * plungeOpacity * vertWeight;
        float stepAlpha = 1.0 - exp(-opticalDensity * pathDs);

        vec3 stepEmit = emitColor * density * beaming * mix(4.8, 5.1, localXray);
        accumCol += transmittance * stepEmit * pathDs;
        transmittance *= (1.0 - stepAlpha);
      }

      void sampleDiskVolumetric(
        vec3 pos,
        vec3 vel,
        float ds,
        float weight,
        inout vec3 accumCol,
        inout float transmittance
      ) {
        if (weight <= 0.001) return;
        float h = dot(pos, DISK_N);
        float uCoord = dot(pos, DISK_U);
        float vCoord = dot(pos, DISK_V);
        float r = length(vec2(uCoord, vCoord));
        if (r < R_PLUNGE_MIN || r > R_DISK_OUT) return;

        float scaleH = diskHalfHeight(r);
        float vert = exp(-(h * h) / (scaleH * scaleH * 1.6));
        evalDiskSample(uCoord, vCoord, r, vert, vel, ds * weight, accumCol, transmittance);
      }

      void main() {
        vec3 ro = cameraPosition;
        vec3 rd = normalize(vWorldPos - cameraPosition);

        vec3 pos = ro;
        vec3 vel = rd;
        float rNow = length(pos);
        bool entersBound = true;

        if (rNow > R_BOUND) {
          float b = dot(pos, vel);
          float c = dot(pos, pos) - R_BOUND * R_BOUND;
          float disc = b * b - c;
          if (disc <= 0.0) {
            entersBound = false;
          } else {
            float tEnter = -b - sqrt(disc);
            if (tEnter > 0.0) {
              pos += vel * (tEnter + 0.01);
            } else if (dot(pos, vel) > 0.0) {
              entersBound = false;
            }
          }
        }

        vec3 accumCol = vec3(0.0);
        float transmittance = 1.0;
        bool captured = false;

        if (entersBound) {
          for (int i = 0; i < 136; i++) {
            float r = length(pos);

            if (r < R_HORIZON) {
              captured = true;
              break;
            }
            if (r > R_BOUND + 0.2 && dot(pos, vel) > 0.0) {
              break;
            }

            float hCur = dot(pos, DISK_N);
            float hDist = abs(hCur);
            float rStep = 0.022 * r + 0.0032 * r * r;
            float diskProximity = exp(-(hDist * hDist) / 0.24) * smoothstep(R_DISK_OUT + 1.8, R_DISK_OUT - 0.5, r);
            float nearStep = clamp(0.020 * r, 0.015, 0.085);
            float ds = mix(clamp(rStep, 0.016, 0.72), nearStep, diskProximity);

            vec3 hVec = cross(pos, vel);
            float h2 = dot(hVec, hVec);

            float r2 = r * r;
            float r5 = r2 * r2 * r;
            vec3 acc0 = -1.5 * R_S * (h2 / max(r5, 1e-4)) * pos;

            vec3 nextPos = pos + vel * ds + 0.5 * acc0 * ds * ds;
            float nr = length(nextPos);
            float nr2 = nr * nr;
            float nr5 = nr2 * nr2 * nr;
            vec3 acc1 = -1.5 * R_S * (h2 / max(nr5, 1e-4)) * nextPos;

            vec3 nextVel = normalize(vel + 0.5 * (acc0 + acc1) * ds);
            float hNext = dot(nextPos, DISK_N);

            if (min(r, nr) < R_DISK_OUT + 0.2) {
              vec3 midVel = normalize(vel + nextVel);
              float sinTheta = abs(dot(midVel, DISK_N));

              float volWeight = smoothstep(0.34, 0.14, sinTheta);
              float analyticWeight = 1.0 - volWeight;

              bool crossedMidplane = (hCur > 0.0 && hNext <= 0.0) || (hCur < 0.0 && hNext >= 0.0);
              if (analyticWeight > 0.001 && crossedMidplane) {
                float tCross = clamp(abs(hCur) / (abs(hCur) + abs(hNext) + 1e-6), 0.0, 1.0);
                vec3 hitPos = mix(pos, nextPos, tCross);
                float uHit = dot(hitPos, DISK_U);
                float vHit = dot(hitPos, DISK_V);
                float rHit = length(vec2(uHit, vHit));
                if (rHit >= R_PLUNGE_MIN && rHit <= R_DISK_OUT) {
                  float effDs = (2.242 * diskHalfHeight(rHit)) / max(sinTheta, 0.14);
                  evalDiskSample(uHit, vHit, rHit, 1.0, midVel, effDs * analyticWeight, accumCol, transmittance);
                }
              }

              if (volWeight > 0.001 && (crossedMidplane || min(hDist, abs(hNext)) < 0.18)) {
                float subDs = ds * 0.333333;
                for (int k = 0; k < 3; k++) {
                  float t = (float(k) + 0.5) * 0.333333;
                  sampleDiskVolumetric(mix(pos, nextPos, t), midVel, subDs, volWeight, accumCol, transmittance);
                }
              }

              if (transmittance < 0.01) break;
            }

            pos = nextPos;
            vel = nextVel;
          }
        }

        if (!captured) {
          accumCol += transmittance * evalDeepSpace(vel);
        }

        if (uDirectTonemap > 0.5) {
          accumCol = pow(acesFilm(accumCol * 1.02), vec3(1.0 / 2.2));
        }

        gl_FragColor = vec4(accumCol, 1.0);
      }
    `,
    side: THREE.BackSide,
    depthWrite: false,
  });
}

// Ultra-lightweight 1-draw-call GPU-animated spaghettified tidal disruption streams
export function createTidalDisruptionMaterial(uniforms: {
  uTime: { value: number };
  uSpectrumWeights: { value: THREE.Vector2 };
  uDirectTonemap: { value: number };
}): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms,
    vertexShader: /* glsl */ `
      attribute vec4 aSeed;
      attribute vec2 aTilt;

      uniform float uTime;

      varying vec2 vUv;
      varying float vHeat;
      varying float vLifeAlpha;
      varying float vDoppler;
      varying vec3 vWorldPos;
      varying float vRadius;

      const vec3 DISK_N = vec3(0.055, 0.996, -0.068);
      const vec3 DISK_U = vec3(0.998, -0.055, 0.000);
      const vec3 DISK_V = vec3(0.004, 0.068, 0.998);

      vec3 evalOrbitalPoint(float r, float phi, float tiltAmp, float tiltPhase) {
        float yOff = sin(phi + tiltPhase) * tiltAmp * r;
        return r * (cos(phi) * DISK_U + sin(phi) * DISK_V) + yOff * DISK_N;
      }

      void main() {
        vUv = uv;

        // Continuous infall cycle (0 = outer capture -> 1 = shredded & swallowed at horizon)
        float cycle = fract(aSeed.y + uTime * aSeed.w);
        float rHead = mix(aSeed.x, 1.30, pow(cycle, 1.28));

        // Tidal spaghettification: ribbon stretches dramatically as it dives close to r_s
        float stretchAngle = 0.16 + 1.55 / pow(max(rHead - 0.72, 0.36), 1.42);
        float along = 1.0 - uv.x; // 0 at head, 1 at trailing tail
        float rSample = mix(rHead, min(rHead + 0.45 + 0.35 * cycle, aSeed.x + 1.2), along * along);

        // Faster Keplerian angular winding as r shrinks
        float phiHead = aSeed.z + uTime * (1.85 / pow(max(rHead, 1.25), 1.15)) + 3.6 * log(max(aSeed.x / max(rHead, 1.1), 1.0));
        float phiSample = phiHead - along * stretchAngle;

        vec3 pCenter = evalOrbitalPoint(rSample, phiSample, aTilt.x, aTilt.y);
        vec3 pAhead = evalOrbitalPoint(max(rSample - 0.04, 1.1), phiSample + 0.05, aTilt.x, aTilt.y);
        vec3 tangent = normalize(pAhead - pCenter);

        vec3 toCam = normalize(cameraPosition - pCenter);
        vec3 side = normalize(cross(tangent, toCam));

        // Tapered filament width: bright compressed head -> razor-thin shredded tail
        float taper = mix(0.16, 1.0, smoothstep(0.0, 0.85, uv.x)) * (1.0 - 0.55 * smoothstep(0.88, 1.0, uv.x));
        float halfW = (0.013 + 0.015 * (1.0 - cycle * 0.45)) * taper;

        vec3 worldPos = pCenter + side * ((uv.y - 0.5) * 2.0 * halfW);
        vWorldPos = worldPos;
        vRadius = rSample;

        // Relativistic Doppler shift & tidal compression heating
        float cosDir = dot(tangent, toCam);
        vDoppler = clamp(0.65 + 0.65 * cosDir, 0.35, 1.55);
        vHeat = clamp(0.35 + 0.65 * (1.0 - (rSample - 1.3) / 7.5), 0.0, 1.0);

        float birthFade = smoothstep(0.0, 0.14, cycle);
        float deathFade = (1.0 - smoothstep(0.76, 0.98, cycle)) * smoothstep(1.30, 1.72, rSample);
        vLifeAlpha = birthFade * deathFade;

        gl_Position = projectionMatrix * viewMatrix * vec4(worldPos, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec2 uSpectrumWeights;
      uniform float uDirectTonemap;

      varying vec2 vUv;
      varying float vHeat;
      varying float vLifeAlpha;
      varying float vDoppler;
      varying vec3 vWorldPos;
      varying float vRadius;

      void main() {
        if (vLifeAlpha < 0.01) discard;

        // Black-hole shadow occlusion: hide streams passing BEHIND the #000000 event horizon shadow
        vec3 dirToCenter = normalize(-cameraPosition);
        float behindBH = dot(vWorldPos, dirToCenter);
        if (behindBH > 0.0) {
          vec3 rayDir = normalize(vWorldPos - cameraPosition);
          float impactB = length(cross(cameraPosition, rayDir));
          if (impactB < 2.60) discard;
        }

        // Crisp glowing core along ribbon spine with rapid longitudinal & cross fade
        float crossProfile = exp(-pow((vUv.y - 0.5) * 3.4, 2.0));
        float tailFade = smoothstep(0.0, 0.72, vUv.x);
        float headSpark = pow(smoothstep(0.65, 0.96, vUv.x), 2.0) * 1.45;
        float intensity = (tailFade * 0.55 + headSpark) * crossProfile * vLifeAlpha * vDoppler;
        if (intensity < 0.01) discard;

        // Sync color seamlessly with Natural / Amber / X-Ray spectrum
        float xray = uSpectrumWeights.y;
        vec3 warmCol = mix(vec3(1.15, 0.44, 0.08), vec3(1.55, 1.24, 0.86), vHeat);
        vec3 amberCol = mix(vec3(1.08, 0.36, 0.06), vec3(1.42, 1.05, 0.62), vHeat);
        vec3 cWarm = mix(warmCol, amberCol, uSpectrumWeights.x);
        vec3 cXray = mix(vec3(0.24, 0.52, 1.25), vec3(0.95, 1.22, 1.55), vHeat);

        float bridge = 4.0 * xray * (1.0 - xray);
        vec3 col = mix(cWarm, cXray, xray);
        col = mix(col, max(col, vec3(0.88, 0.25, 0.98)), bridge * 0.45);

        float gain = uDirectTonemap > 0.5 ? 0.62 : 0.78;
        gl_FragColor = vec4(col * intensity * gain, 1.0);
      }
    `,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    depthTest: false,
    side: THREE.DoubleSide,
  });
}

export const CinemaOpticsShader = {
  uniforms: {
    tDiffuse: { value: null },
    uResolution: { value: new THREE.Vector2(1440, 900) },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform vec2 uResolution;
    varying vec2 vUv;

    float ditherHash(vec2 p) {
      return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453);
    }

    void main() {
      vec2 centered = vUv - 0.5;
      float r2 = dot(centered, centered);

      vec4 col = texture2D(tDiffuse, vUv);
      float vig = 1.0 - r2 * 0.20;
      col.rgb *= vig;

      col.rgb += (ditherHash(gl_FragCoord.xy) - 0.5) / 255.0;
      gl_FragColor = col;
    }
  `,
};
