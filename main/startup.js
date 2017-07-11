var canvas;
var gl;
var shaderProgram;

// Projection matrix
var pMatrix;
// ModelView matrix
var mvMatrix;
// Normal matrix
var nMatrix;

// VBOS
var verticesBuffer;
var verticesIndexBuffer;
var verticesColorBuffer;
var verticesNormalBuffer;

// UBOS
var uniformPerDrawBuffer;
var uniformPerPassBuffer;
var uniformPerSceneBuffer;

// Contains matrices: projection, modelView and normals
var transforms;
// Contains the geometry and material properties of the object
var mesh;
// Contains the lights of the scene
var lights = [];
// Same as lights but with position * modelViewMatrix
var dataLights = [];
var max_lights = 5;

function start() {
    canvas = document.getElementById('glCanvas');
    initInputs();
    
    // Initialize the GL context
    gl = canvas.getContext('webgl2', { antialias: true });
    var isWebGL2 = !!gl;
    if(!isWebGL2) {
        alert("Your browser does not support WebGL2 :/");
        return;
    }

    // Only continue if WebGL is available and working
    if (!gl) {
    return;
    }

    // Enable depth testing
    gl.enable(gl.DEPTH_TEST);
    // Near things obscure far things
    gl.depthFunc(gl.LEQUAL);
    // Enable ulling 
    gl.enable(gl.CULL_FACE);
    // Cull only back faces
    gl.cullFace(gl.BACK);
    // Set clear color to white, fully opaque
    gl.clearColor(1.0, 1.0, 1.0, 1.0);
    // Clear the color as well as the depth buffer.
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    // Initiate shaders
    initShaders();

    // Initiate buffers
    initBuffers();

    // Fill the uniform buffers
    initUBOs();

    // Init VAO
    initVAO();

    // Draw the scene
    drawScene();

}

function initShaders() {
    vertex_shader = vertex_shader.replace(/^\s+|\s+$/g, '');
    fragment_shader = fragment_shader.replace(/^\s+|\s+$/g, '');
    shaderProgram = createProgram(gl, vertex_shader, fragment_shader);

    // If creating the shader program failed, alert
    if (!gl.getProgramParameter(shaderProgram, gl.LINK_STATUS)) {
        console.log('Unable to initialize the shader program: ' + gl.getProgramInfoLog(shaderProgram));
    }

    gl.useProgram(shaderProgram);
}

window.createProgram = function(gl, vertexShaderSource, fragmentShaderSource) {
    var program = gl.createProgram();
    var vshader = createShader(gl, vertexShaderSource, gl.VERTEX_SHADER);
    var fshader = createShader(gl, fragmentShaderSource, gl.FRAGMENT_SHADER);
    gl.attachShader(program, vshader);
    gl.deleteShader(vshader);
    gl.attachShader(program, fshader);
    gl.deleteShader(fshader);
    gl.linkProgram(program);

    var log = gl.getProgramInfoLog(program);
    if (log) {
        console.log(log);
    }

    log = gl.getShaderInfoLog(vshader);
    if (log) {
        console.log(log);
    }

    log = gl.getShaderInfoLog(fshader);
    if (log) {
        console.log(log);
    }

    return program;
};

function createShader(gl, source, type) {
    var shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    return shader;
}

function initBuffers() {

    // Load obj file
    mesh = new Mesh();
    mesh.loadOFF(monkeyjs);

    // Vertex Buffer
    verticesBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, verticesBuffer);
    var positions = new Float32Array(flattenObject(mesh.m_positions));
    gl.bufferData(gl.ARRAY_BUFFER, positions, gl.STATIC_DRAW);
    gl.bindBuffer(gl.UNIFORM_BUFFER, null);

    // Index buffer
    verticesIndexBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, verticesIndexBuffer);
    var triangles = new Uint16Array(flattenObject(mesh.m_triangles));
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(triangles), gl.STATIC_DRAW);
    gl.bindBuffer(gl.UNIFORM_BUFFER, null);

    // Normals Buffer
    verticesNormalBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, verticesNormalBuffer);
    var normals = new Float32Array(flattenObject(mesh.m_normals));
    gl.bufferData(gl.ARRAY_BUFFER, normals, gl.STATIC_DRAW);
    gl.bindBuffer(gl.UNIFORM_BUFFER, null);

    // Color Buffer
    verticesColorBuffer = gl.createBuffer();
    // TODO: remove when we have actual lighting calculations
    var colors = [];
    for(var i=0; i<positions.length; i++){
        colors.push(1.0);
        colors.push(0.0); //Math.random()
        colors.push(0.0);
        colors.push(1.0);
    }
    gl.bindBuffer(gl.ARRAY_BUFFER, verticesColorBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(colors), gl.STATIC_DRAW);
    gl.bindBuffer(gl.UNIFORM_BUFFER, null);
}

function initUBOs(){

    // Find and link uniform blocks
    var uniformPerDrawLocation = gl.getUniformBlockIndex(shaderProgram, 'PerDraw');
    var uniformPerPassLocation = gl.getUniformBlockIndex(shaderProgram, 'PerPass');
    var uniformPerSceneLocation = gl.getUniformBlockIndex(shaderProgram, 'PerScene'); 
    gl.uniformBlockBinding(shaderProgram, uniformPerDrawLocation, 0);
    gl.uniformBlockBinding(shaderProgram, uniformPerPassLocation, 1);
    gl.uniformBlockBinding(shaderProgram, uniformPerSceneLocation, 2);

    // Create transform UBO and bind it to data
    createMatrixTransforms();
    uniformPerDrawBuffer = gl.createBuffer();
    gl.bindBuffer(gl.UNIFORM_BUFFER, uniformPerDrawBuffer);
    gl.bufferData(gl.UNIFORM_BUFFER, transforms, gl.DYNAMIC_DRAW);
    gl.bufferSubData(gl.UNIFORM_BUFFER, 0, transforms);
    gl.bindBuffer(gl.UNIFORM_BUFFER, null);

    // Create and bind light to light UBO
    var lightData = createLights();
    uniformPerPassBuffer = gl.createBuffer();
    gl.bindBuffer(gl.UNIFORM_BUFFER, uniformPerPassBuffer);
    gl.bufferData(gl.UNIFORM_BUFFER, lightData, gl.DYNAMIC_DRAW);
    gl.bufferSubData(gl.UNIFORM_BUFFER, 0, lightData);
    gl.bindBuffer(gl.UNIFORM_BUFFER, null);

    // Create material UBO and bind it to data
    var meshMaterial = createMeshMaterial();
    uniformPerSceneBuffer = gl.createBuffer();
    gl.bindBuffer(gl.UNIFORM_BUFFER, uniformPerSceneBuffer);
    gl.bufferData(gl.UNIFORM_BUFFER, meshMaterial, gl.STATIC_DRAW);
    gl.bufferSubData(gl.UNIFORM_BUFFER, 0, meshMaterial);
    gl.bindBuffer(gl.UNIFORM_BUFFER, null);
}

function initVAO(){

    // Create buffer location attributes
    vertexPositionAttribute = 0;
    vertexNormalAttribute = 1;
    vertexColorAttribute = 2; 

    // Fill VAO with the right calls
    var vertexArray = gl.createVertexArray();
    gl.bindVertexArray(vertexArray);

    gl.bindBuffer(gl.ARRAY_BUFFER, verticesBuffer);
    gl.enableVertexAttribArray(vertexPositionAttribute);
    gl.vertexAttribPointer(vertexPositionAttribute, 3, gl.FLOAT, false, 0, 0);

    // Send normals
    gl.bindBuffer(gl.ARRAY_BUFFER, verticesNormalBuffer);
    gl.enableVertexAttribArray(vertexNormalAttribute);   
    gl.vertexAttribPointer(vertexNormalAttribute, 3, gl.FLOAT, false, 0, 0);

    // Send colors
    gl.bindBuffer(gl.ARRAY_BUFFER, verticesColorBuffer);
    gl.enableVertexAttribArray(vertexColorAttribute); 
    gl.vertexAttribPointer(vertexColorAttribute, 4, gl.FLOAT, false, 0, 0);
    
    gl.bindBuffer(gl.ARRAY_BUFFER, null);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, verticesIndexBuffer);

    gl.bindBufferBase(gl.UNIFORM_BUFFER, 0, uniformPerDrawBuffer);
    gl.bindBufferBase(gl.UNIFORM_BUFFER, 1, uniformPerPassBuffer);
    gl.bindBufferBase(gl.UNIFORM_BUFFER, 2, uniformPerSceneBuffer);
}

function createMatrixTransforms(){
    pMatrix = makePerspective(fovAngle, canvas.width/canvas.height, nearPlane, farPlane);
    setupCamera();
    nMatrix  = Matrix.I(4);
    // pMatrix + mvMatrix + nMatrix
    transforms = new Float32Array((pMatrix.flatten().concat(mvMatrix.flatten())).concat(nMatrix.flatten()));
}

function createLights(){
    // Actual lights of the scene
    lights.push(new LightSource($V([5,5,-5,1]),$V([1,1,1]),100));
    lights.push(new LightSource($V([-5,5,5,1]),$V([1,1,0.5]),100));
    
    // Filling dummy data for up to 5 lights because the UBO / shader expects 5 max
    for(var i=0; i<max_lights; i++){
        if(i<lights.length){
            // Update position with mvMatrix and store in dataLights
            var l = LightSource.createLightSource(lights[i]);
            l.position = mvMatrix.multiply(lights[i].position);
            dataLights.push(l);
        }else{
            // Dummy data
            dataLights.push(new LightSource());
        }
    }
    
    var floatArray = new Float32Array(flattenObject(dataLights).concat(lights.length));
    // Forget about the dummy data, we just had to send it once to the graphic card
    dataLights = dataLights.slice(0,lights.length);
    return floatArray;
}

function createMeshMaterial(){
    // Create material
    var padding = -1;
    // Buffer is apparently 16-aligned, must pad with 3 floats => 5*4 + 3*4 => 32
    return new Float32Array([
        mesh.diffuse,
        mesh.specular,
        mesh.shininess,
        mesh.roughness,
        mesh.fresnel,
        padding,
        padding,
        padding
    ]);
}