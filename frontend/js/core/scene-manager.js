export class SceneManager {
    constructor(container) {
        this.container = container;
        this.setupScene();
        this.setupLights();
        this.setupBackground();
        this.setupResizeHandler();
        
        // Time tracking for animations
        this.clock = new THREE.Clock();
    }

    setupScene() {
        this.scene = new THREE.Scene();
        this.camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.1, 2000);
        this.renderer = new THREE.WebGLRenderer({ antialias: true });
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.setClearColor(0x1a1a1a);
        this.container.appendChild(this.renderer.domElement);

        this.controls = new THREE.OrbitControls(this.camera, this.renderer.domElement);
        Object.assign(this.controls, {
            enableDamping: true,
            dampingFactor: 0.05,
            screenSpacePanning: false,
            minDistance: 3,
            maxDistance: 15
        });

        // Set initial camera position
        this.camera.position.set(0, 2, 8);
        this.camera.lookAt(0, 0, 0);
    }

    setupLights() {
        this.ambientLight = new THREE.AmbientLight(0x404040, 0.6);
        this.pointLight = new THREE.PointLight(0xffffff, 1);
        this.pointLight.position.set(10, 10, 10);
        this.pointLight2 = new THREE.PointLight(0xffffff, 0.8);
        this.pointLight2.position.set(-10, -10, -10);
        this.scene.add(this.ambientLight, this.pointLight, this.pointLight2);
    }

    setupResizeHandler() {
        window.addEventListener('resize', () => {
            this.camera.aspect = window.innerWidth / window.innerHeight;
            this.camera.updateProjectionMatrix();
            this.renderer.setSize(window.innerWidth, window.innerHeight);
        });
    }

    // Core materials used across the application
    getMaterials() {
        return {
            ssid: new THREE.MeshPhongMaterial({ 
                color: 0x0066ff,  
                emissive: 0x003366,
                shininess: 30
            }),
            ap: new THREE.MeshPhongMaterial({ 
                color: 0xffffff,
                emissive: 0x111111,
                shininess: 30
            }),
            apRing: new THREE.MeshPhongMaterial({
                color: 0x0066ff,
                emissive: 0x003366,
                shininess: 10,
                opacity: 0.6,
                transparent: true
            }),
            client: new THREE.MeshPhongMaterial({ 
                color: 0x00c853,
                emissive: 0x004d1f,
                shininess: 80
            }),
            line: new THREE.LineBasicMaterial({ 
                color: 0x444444,
                opacity: 0.4,
                transparent: true
            })
        };
    }

    // Animation frame handling
    startAnimation(renderCallback) {
        const animate = () => {
            requestAnimationFrame(animate);
            const deltaTime = this.clock.getDelta();
            
            // Update background animations
            if (this.particleSystem) {
                this.updateParticles(deltaTime);
            }
            if (this.atmosphereMesh) {
                this.updateAtmosphere(deltaTime);
            }
            
            this.controls.update();
            if (renderCallback) {
                renderCallback();
            }
            this.renderer.render(this.scene, this.camera);
        };
        animate();
    }

    setupBackground() {
        // Create particle system for the void effect
        const particleCount = 1500;
        const particleGeometry = new THREE.BufferGeometry();
        const positions = new Float32Array(particleCount * 3);
        const opacities = new Float32Array(particleCount);
        const scales = new Float32Array(particleCount);
        const randomVelocities = new Float32Array(particleCount * 3);

        for (let i = 0; i < particleCount; i++) {
            const i3 = i * 3;
            // Position particles in a spherical shell for 360-degree coverage
            const radius = 35 + Math.pow(Math.random(), 0.5) * 15; // Tighter radius range for more uniform coverage
            const theta = Math.random() * Math.PI * 2;
            const phi = Math.acos((Math.random() * 2) - 1);
            
            // Calculate position with full 360-degree distribution
            const x = radius * Math.sin(phi) * Math.cos(theta);
            const y = radius * Math.sin(phi) * Math.sin(theta);
            const z = radius * Math.cos(phi);
            
            positions[i3] = x;
            positions[i3 + 1] = y;
            positions[i3 + 2] = z;
            
            opacities[i] = 0.2 + Math.random() * 0.2;
            scales[i] = 0.8 + Math.random() * 1.2;
            
            // Random velocities for movement (slower)
            randomVelocities[i3] = (Math.random() - 0.5) * 0.015;
            randomVelocities[i3 + 1] = (Math.random() - 0.5) * 0.015;
            randomVelocities[i3 + 2] = (Math.random() - 0.5) * 0.015;
        }

        particleGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        particleGeometry.setAttribute('opacity', new THREE.BufferAttribute(opacities, 1));
        particleGeometry.setAttribute('scale', new THREE.BufferAttribute(scales, 1));
        
        // Custom shader material for particles
        const particleMaterial = new THREE.ShaderMaterial({
            uniforms: {
                color: { value: new THREE.Color(0x444466) },
                time: { value: 0 }
            },
            vertexShader: `
                attribute float opacity;
                attribute float scale;
                varying float vOpacity;
                
                void main() {
                    vOpacity = opacity;
                    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
                    gl_Position = projectionMatrix * mvPosition;
                    gl_PointSize = scale * (250.0 / -mvPosition.z);
                }
            `,
            fragmentShader: `
                uniform vec3 color;
                varying float vOpacity;
                
                void main() {
                    float r = length(gl_PointCoord - vec2(0.5));
                    if (r > 0.5) discard;
                    float opacity = vOpacity * smoothstep(0.5, 0.0, r);
                    gl_FragColor = vec4(color, opacity);
                }
            `,
            transparent: true,
            depthWrite: false,
            blending: THREE.AdditiveBlending
        });

        this.particleSystem = new THREE.Points(particleGeometry, particleMaterial);
        this.particleVelocities = randomVelocities;
        this.scene.add(this.particleSystem);

        // Create atmospheric background
        const atmosphereGeometry = new THREE.IcosahedronGeometry(50, 3);
        const atmosphereMaterial = new THREE.ShaderMaterial({
            uniforms: {
                time: { value: 0 },
                baseColor: { value: new THREE.Color(0x1a1a2a) },
                accentColor: { value: new THREE.Color(0x2a2a4a) }
            },
            vertexShader: `
                varying vec3 vNormal;
                varying vec3 vPosition;
                
                void main() {
                    vNormal = normal;
                    vPosition = position;
                    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
                }
            `,
            fragmentShader: `
                uniform float time;
                uniform vec3 baseColor;
                uniform vec3 accentColor;
                varying vec3 vNormal;
                varying vec3 vPosition;
                
                // Simplex noise function
                vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
                vec4 mod289(vec4 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
                vec4 permute(vec4 x) { return mod289(((x*34.0)+1.0)*x); }
                vec4 taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }
                
                float snoise(vec3 v) {
                    const vec2 C = vec2(1.0/6.0, 1.0/3.0);
                    const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);
                    
                    vec3 i  = floor(v + dot(v, C.yyy));
                    vec3 x0 = v - i + dot(i, C.xxx);
                    vec3 g = step(x0.yzx, x0.xyz);
                    vec3 l = 1.0 - g;
                    vec3 i1 = min(g.xyz, l.zxy);
                    vec3 i2 = max(g.xyz, l.zxy);
                    vec3 x1 = x0 - i1 + C.xxx;
                    vec3 x2 = x0 - i2 + C.yyy;
                    vec3 x3 = x0 - D.yyy;
                    
                    i = mod289(i);
                    vec4 p = permute(permute(permute(
                        i.z + vec4(0.0, i1.z, i2.z, 1.0))
                        + i.y + vec4(0.0, i1.y, i2.y, 1.0))
                        + i.x + vec4(0.0, i1.x, i2.x, 1.0));
                        
                    float n_ = 0.142857142857;
                    vec3 ns = n_ * D.wyz - D.xzx;
                    vec4 j = p - 49.0 * floor(p * ns.z * ns.z);
                    vec4 x_ = floor(j * ns.z);
                    vec4 y_ = floor(j - 7.0 * x_);
                    vec4 x = x_ *ns.x + ns.yyyy;
                    vec4 y = y_ *ns.x + ns.yyyy;
                    vec4 h = 1.0 - abs(x) - abs(y);
                    vec4 b0 = vec4(x.xy, y.xy);
                    vec4 b1 = vec4(x.zw, y.zw);
                    vec4 s0 = floor(b0)*2.0 + 1.0;
                    vec4 s1 = floor(b1)*2.0 + 1.0;
                    vec4 sh = -step(h, vec4(0.0));
                    vec4 a0 = b0.xzyw + s0.xzyw*sh.xxyy;
                    vec4 a1 = b1.xzyw + s1.xzyw*sh.zzww;
                    vec3 p0 = vec3(a0.xy,h.x);
                    vec3 p1 = vec3(a0.zw,h.y);
                    vec3 p2 = vec3(a1.xy,h.z);
                    vec3 p3 = vec3(a1.zw,h.w);
                    
                    vec4 norm = taylorInvSqrt(vec4(dot(p0,p0), dot(p1,p1), dot(p2, p2), dot(p3,p3)));
                    p0 *= norm.x;
                    p1 *= norm.y;
                    p2 *= norm.z;
                    p3 *= norm.w;
                    
                    vec4 m = max(0.6 - vec4(dot(x0,x0), dot(x1,x1), dot(x2,x2), dot(x3,x3)), 0.0);
                    m = m * m;
                    return 42.0 * dot(m*m, vec4(dot(p0,x0), dot(p1,x1), dot(p2,x2), dot(p3,x3)));
                }
                
                void main() {
                    vec3 pos = vPosition * 0.02;
                    float noise = snoise(pos + vec3(time * 0.1));
                    noise += 0.5 * snoise(pos * 2.0 + vec3(time * 0.2));
                    
                    float gradient = length(vPosition) * 0.005;
                    vec3 color = mix(baseColor, accentColor, noise * 0.5 + gradient);
                    
                    gl_FragColor = vec4(color, 0.2 * (1.0 - gradient));
                }
            `,
            transparent: true,
            depthWrite: false,
            side: THREE.BackSide,
            blending: THREE.AdditiveBlending
        });

        this.atmosphereMesh = new THREE.Mesh(atmosphereGeometry, atmosphereMaterial);
        this.scene.add(this.atmosphereMesh);
    }

    updateParticles(deltaTime) {
        const positions = this.particleSystem.geometry.attributes.position.array;
        const opacities = this.particleSystem.geometry.attributes.opacity.array;
        
        for (let i = 0; i < positions.length; i += 3) {
            // Update positions based on velocities
            positions[i] += this.particleVelocities[i] * deltaTime * 60;
            positions[i + 1] += this.particleVelocities[i + 1] * deltaTime * 60;
            positions[i + 2] += this.particleVelocities[i + 2] * deltaTime * 60;
            
            // Reset particles that get too close to center
            const distanceToCenter = Math.sqrt(
                positions[i] * positions[i] + 
                positions[i + 1] * positions[i + 1] + 
                positions[i + 2] * positions[i + 2]
            );
            
            if (distanceToCenter < 15) {
                const newRadius = 45;
                const newTheta = Math.random() * Math.PI * 2;
                const newPhi = Math.acos((Math.random() * 2) - 1);
                
                positions[i] = newRadius * Math.sin(newPhi) * Math.cos(newTheta);
                positions[i + 1] = newRadius * Math.sin(newPhi) * Math.sin(newTheta);
                positions[i + 2] = newRadius * Math.cos(newPhi);
            }
            
            // Fade opacity
            const opacityIndex = i / 3;
            opacities[opacityIndex] += (Math.random() - 0.5) * 0.008;
            opacities[opacityIndex] = Math.max(0.2, Math.min(0.4, opacities[opacityIndex]));
        }
        
        this.particleSystem.geometry.attributes.position.needsUpdate = true;
        this.particleSystem.geometry.attributes.opacity.needsUpdate = true;
        this.particleSystem.material.uniforms.time.value += deltaTime;
    }

    updateAtmosphere(deltaTime) {
        this.atmosphereMesh.material.uniforms.time.value += deltaTime;
        this.atmosphereMesh.rotation.y += deltaTime * 0.02;
    }

    // Scene manipulation methods
    add(object) {
        this.scene.add(object);
    }

    remove(object) {
        this.scene.remove(object);
    }

    // Utility methods
    projectToScreen(position) {
        const vector = position.clone().project(this.camera);
        return {
            x: (vector.x * 0.5 + 0.5) * window.innerWidth,
            y: (-vector.y * 0.5 + 0.5) * window.innerHeight
        };
    }

    getDistanceToCamera(position) {
        return this.camera.position.distanceTo(position);
    }

    setCameraPosition(position, lookAt) {
        this.camera.position.copy(position);
        if (lookAt) {
            this.camera.lookAt(lookAt);
        }
    }

    getDomElement() {
        return this.renderer.domElement;
    }

    getScene() {
        return this.scene;
    }

    getCamera() {
        return this.camera;
    }

    getRenderer() {
        return this.renderer;
    }
}
