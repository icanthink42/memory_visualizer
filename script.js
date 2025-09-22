document.addEventListener('DOMContentLoaded', () => {
    const codeInput = document.getElementById('code-input');
    const runButton = document.getElementById('run-button');
    const output = document.getElementById('output');
    const stackContainer = document.getElementById('stack-container');
    const heapContainer = document.getElementById('heap-container');
    const arrowsContainer = document.getElementById('arrows-container');

    // Store variable values and their types
    let stackVariables = new Map();
    let heapObjects = new Map();
    let heapRefs = new Map(); // Track references between heap objects
    let stackRefs = new Map(); // Track stack-to-heap references
    let heapElements = new Map(); // Track heap DOM elements
    let nextHeapAddress = 0x1000; // Starting heap address

    // Custom console.log implementation to capture output
    const originalConsoleLog = console.log;
    const logs = [];

    console.log = (...args) => {
        logs.push(args.map(arg =>
            typeof arg === 'object' ? JSON.stringify(arg, null, 2) : String(arg)
        ).join(' '));
        originalConsoleLog.apply(console, args);
    };

    function generateHeapAddress() {
        return '0x' + (nextHeapAddress++).toString(16).toUpperCase().padStart(8, '0');
    }

    function formatValue(value) {
        if (Array.isArray(value)) {
            const formattedItems = value.map(item => {
                if (typeof item === 'object' && item !== null || typeof item === 'string') {
                    return toHexString(item); // Show memory address for nested objects and strings
                }
                return String(item);
            });
            return `[${formattedItems.join(', ')}]`;
        } else if (value === null) {
            return 'null';
        } else if (value === undefined) {
            return 'undefined';
        } else if (typeof value === 'string') {
            return `"${value}"`; // Show string value in quotes
        } else if (typeof value === 'object') {
            const entries = Object.entries(value).map(([key, val]) => {
                if (typeof val === 'object' && val !== null || typeof val === 'string') {
                    return `${key}: ${toHexString(val)}`; // Show memory address for nested objects and strings
                }
                return `${key}: ${String(val)}`;
            });
            return `{${entries.join(', ')}}`;
        }
        return String(value);
    }

    function processHeapObjects(value) {
        // First ensure this object has an address
        if ((typeof value === 'object' && value !== null || typeof value === 'string') && !heapObjects.has(value)) {
            const address = generateHeapAddress();
            heapObjects.set(value, address);
            if (typeof value === 'object') {
                heapRefs.set(value, new Set()); // Initialize empty set of references
            }
        }

        if (Array.isArray(value)) {
            // Process array elements
            value.forEach(item => {
                if (typeof item === 'object' && item !== null || typeof item === 'string') {
                    processHeapObjects(item);
                    heapRefs.get(value).add(item); // Track reference from array to item
                }
            });
        } else if (typeof value === 'object' && value !== null) {
            // Process object values
            Object.values(value).forEach(val => {
                if (typeof val === 'object' && val !== null || typeof val === 'string') {
                    processHeapObjects(val);
                    heapRefs.get(value).add(val); // Track reference from object to value
                }
            });
        }
    }

    function toHexString(value) {
        if (typeof value === 'number') {
            // Handle integers and floats differently
            if (Number.isInteger(value)) {
                return '0x' + value.toString(16).toUpperCase().padStart(8, '0');
            } else {
                // Convert float to 64-bit binary representation
                const buffer = new ArrayBuffer(8);
                new Float64Array(buffer)[0] = value;
                const bytes = new Uint8Array(buffer);
                return '0x' + Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('').toUpperCase();
            }
        } else if (typeof value === 'string') {
            // Treat strings as heap objects
            for (const [existingValue, existingAddress] of heapObjects.entries()) {
                if (existingValue === value) {
                    return existingAddress;
                }
            }
            const address = generateHeapAddress();
            heapObjects.set(value, address);
            return address;
        } else if (typeof value === 'boolean') {
            return value ? '0x01' : '0x00';
        } else if (value === null) {
            return '0x00000000';
        } else if (value === undefined) {
            return '0xUNDEFINED';
        } else if (typeof value === 'object' && value !== null) {
            // For objects, we need to handle reference equality properly
            for (const [existingValue, existingAddress] of heapObjects.entries()) {
                // Check if this is the exact same object reference
                if (existingValue === value) {
                    return existingAddress;
                }
            }
            // If not found, allocate new address
            const address = generateHeapAddress();
            heapObjects.set(value, address);
            return address;
        }
        return '0xUNKNOWN';
    }

    function findBoxIntersection(startX, startY, endX, endY, boxX, boxY, boxWidth, boxHeight) {
        // Calculate box center
        const centerX = boxX + boxWidth / 2;
        const centerY = boxY + boxHeight / 2;

        // Vector from start to end
        const dx = endX - startX;
        const dy = endY - startY;

        // Normalize the vector
        const length = Math.sqrt(dx * dx + dy * dy);
        const unitX = dx / length;
        const unitY = dy / length;

        // Calculate intersection with box edges
        let t;

        // Check vertical edges
        if (unitX > 0) {
            t = (boxX - startX) / unitX;
        } else {
            t = (boxX + boxWidth - startX) / unitX;
        }

        let intersectX = startX + unitX * t;
        let intersectY = startY + unitY * t;

        // If intersection point is outside vertical bounds, use horizontal edges
        if (intersectY < boxY || intersectY > boxY + boxHeight) {
            if (unitY > 0) {
                t = (boxY - startY) / unitY;
            } else {
                t = (boxY + boxHeight - startY) / unitY;
            }
            intersectX = startX + unitX * t;
            intersectY = startY + unitY * t;
        }

        return {
            x: intersectX,
            y: intersectY
        };
    }

    function drawArrow(startElement, endElement) {
        const memoryContainer = document.querySelector('.memory-container');
        const containerRect = memoryContainer.getBoundingClientRect();
        const start = startElement.getBoundingClientRect();
        const end = endElement.getBoundingClientRect();

        // Calculate centers relative to the memory container
        const startCenterX = start.left + (start.width / 2) - containerRect.left;
        const startCenterY = start.top + (start.height / 2) - containerRect.top;
        const endCenterX = end.left + (end.width / 2) - containerRect.left;
        const endCenterY = end.top + (end.height / 2) - containerRect.top;

        // Calculate start and end points with box intersections
        let startX = startCenterX;
        let startY = startCenterY;
        let endX = endCenterX;
        let endY = endCenterY;

        if (endElement.classList.contains('heap-node')) {
            const intersection = findBoxIntersection(
                startCenterX, startCenterY,
                endCenterX, endCenterY,
                end.left - containerRect.left,
                end.top - containerRect.top,
                end.width,
                end.height
            );
            endX = intersection.x;
            endY = intersection.y;
        }

        if (startElement.classList.contains('heap-node')) {
            const intersection = findBoxIntersection(
                endCenterX, endCenterY,
                startCenterX, startCenterY,
                start.left - containerRect.left,
                start.top - containerRect.top,
                start.width,
                start.height
            );
            startX = intersection.x;
            startY = intersection.y;
        }

        // For stack boxes, adjust to bottom center if not a heap node
        if (!startElement.classList.contains('heap-node')) {
            startY = start.bottom - containerRect.top;
        }

        // Create arrow element
        const arrow = document.createElement('div');
        arrow.className = 'memory-arrow';

        // Calculate dimensions
        const dx = endX - startX;
        const dy = endY - startY;
        const length = Math.sqrt(dx * dx + dy * dy);
        const angle = Math.atan2(dy, dx) * (180 / Math.PI);

        // Style the arrow
        arrow.style.width = `${length}px`;
        arrow.style.left = `${startX}px`;
        arrow.style.top = `${startY}px`;
        arrow.style.transformOrigin = '0 0';
        arrow.style.transform = `rotate(${angle}deg)`;
        arrow.style.position = 'absolute';

        // Add arrowhead with correct rotation
        const arrowhead = document.createElement('div');
        arrowhead.className = 'memory-arrow-head';
        arrowhead.style.transform = `rotate(${angle - 45}deg)`;
        arrow.appendChild(arrowhead);

        return arrow;
    }

    function updateStackVisualization() {
        stackContainer.innerHTML = '';
        stackRefs.clear(); // Clear existing references

        stackVariables.forEach((value, name) => {
            const box = document.createElement('div');
            box.className = 'stack-box';

            const nameDiv = document.createElement('div');
            nameDiv.className = 'stack-box-name';
            nameDiv.textContent = name;

            const valueDiv = document.createElement('div');
            valueDiv.className = 'stack-box-value';
            const hexValue = toHexString(value);
            valueDiv.textContent = hexValue;

            // Add reference indicator for heap objects
            if (typeof value === 'object' && value !== null) {
                valueDiv.classList.add('heap-reference');
                // Group stack elements by their heap address
                if (!stackRefs.has(hexValue)) {
                    stackRefs.set(hexValue, []);
                }
                stackRefs.get(hexValue).push(box);
            }

            box.appendChild(nameDiv);
            box.appendChild(valueDiv);
            stackContainer.appendChild(box);
        });

        return stackRefs;
    }

    function updateHeapVisualization(stackRefs) {
        heapContainer.innerHTML = '';
        arrowsContainer.innerHTML = '';
        heapElements.clear();
        const addressToValue = new Map();

        // First, create a map of unique addresses to their values
        heapObjects.forEach((address, value) => {
            addressToValue.set(address, value);
        });

        // Create a temporary element to measure text
        const measureDiv = document.createElement('div');
        measureDiv.style.position = 'absolute';
        measureDiv.style.visibility = 'hidden';
        measureDiv.style.whiteSpace = 'pre-wrap';
        measureDiv.style.padding = '1rem';
        measureDiv.style.maxWidth = '400px'; // Maximum width we'll allow
        measureDiv.style.fontFamily = 'Monaco, Menlo, Ubuntu Mono, monospace';
        measureDiv.style.fontSize = '0.85rem';
        document.body.appendChild(measureDiv);

        // Function to calculate node size based on content
        function calculateNodeSize(value) {
            measureDiv.textContent = formatValue(value);
            const rect = measureDiv.getBoundingClientRect();
            const minWidth = 120;
            const minHeight = 60;
            const padding = 40;

            return {
                width: Math.max(minWidth, rect.width + padding),
                height: Math.max(minHeight, rect.height + padding)
            };
        }

        // Calculate sizes for all nodes
        const nodeSizes = new Map();
        addressToValue.forEach((value, address) => {
            nodeSizes.set(address, calculateNodeSize(value));
        });

        // Clean up measurement div
        document.body.removeChild(measureDiv);

        const minSpacing = 40; // minimum space between nodes
        const containerWidth = heapContainer.clientWidth;
        const containerHeight = heapContainer.clientHeight;
        const centerX = containerWidth / 2;
        const centerY = containerHeight / 2;

        // Function to calculate position on a spiral
        function calculateSpiralPosition(index, nodeCount, spacing) {
            // Angle increases with each node, but slows down as we get further out
            const angle = index * (Math.PI / 2);
            // Radius increases with each node, scaled by the spacing
            const radius = Math.sqrt(index) * spacing;
            // Add some randomness to the radius, scaled by the spacing
            const randomRadius = radius + (Math.random() - 0.5) * spacing * 0.3;

            return {
                x: centerX + Math.cos(angle) * randomRadius,
                y: centerY + Math.sin(angle) * randomRadius
            };
        }

        // Create heap nodes with spiral positioning
        let index = 0;
        const nodeCount = addressToValue.size;
        addressToValue.forEach((value, address) => {
            const { width, height } = nodeSizes.get(address);
            const node = document.createElement('div');
            node.className = 'heap-node';

            // Set size of this specific node
            node.style.width = `${width}px`;
            node.style.height = `${height}px`;

            const contentDiv = document.createElement('div');
            contentDiv.className = 'heap-node-content';
            contentDiv.textContent = formatValue(value);

            node.appendChild(contentDiv);
            heapContainer.appendChild(node);

            // Calculate spiral position with spacing based on maximum node dimension
            const maxDimension = Math.max(width, height);
            const spacing = Math.max(maxDimension, minSpacing);
            const pos = calculateSpiralPosition(index, nodeCount, spacing);

            // Position the node
            node.style.left = `${pos.x - width/2}px`;
            node.style.top = `${pos.y - height/2}px`;

            // Add drag functionality
            let isDragging = false;
            let currentX;
            let currentY;
            let initialX;
            let initialY;
            let xOffset = pos.x - width/2;
            let yOffset = pos.y - height/2;

            node.addEventListener("mousedown", dragStart);
            document.addEventListener("mousemove", drag);
            document.addEventListener("mouseup", dragEnd);

            function dragStart(e) {
                const containerRect = heapContainer.getBoundingClientRect();
                initialX = e.clientX - containerRect.left - xOffset;
                initialY = e.clientY - containerRect.top - yOffset;

                if (e.target === node || e.target === contentDiv) {
                    isDragging = true;
                    node.classList.add('dragging');
                }
            }

            function drag(e) {
                if (isDragging) {
                    e.preventDefault();

                    const containerRect = heapContainer.getBoundingClientRect();
                    currentX = e.clientX - containerRect.left - initialX;
                    currentY = e.clientY - containerRect.top - initialY;

                    // Keep node within container bounds
                    currentX = Math.max(0, Math.min(currentX, containerRect.width - width));
                    currentY = Math.max(0, Math.min(currentY, containerRect.height - height));

                    xOffset = currentX;
                    yOffset = currentY;

                    node.style.left = `${currentX}px`;
                    node.style.top = `${currentY}px`;

                    // Update arrows
                    requestAnimationFrame(updateArrows);
                }
            }

            function dragEnd(e) {
                initialX = currentX;
                initialY = currentY;
                isDragging = false;
                node.classList.remove('dragging');
            }

            heapElements.set(address, node);
            index++;
        });

        // Update container height based on the spiral size
        const maxRadius = Math.sqrt(nodeCount) * minSpacing;
        const minSize = Math.max(maxRadius * 2.5, containerHeight);
        heapContainer.style.height = `${minSize}px`;

        // Draw arrows from all stack elements to their heap nodes
        stackRefs.forEach((stackElements, address) => {
            const heapElement = heapElements.get(address);
            if (heapElement) {
                stackElements.forEach(stackElement => {
                    const arrow = drawArrow(stackElement, heapElement);
                    arrowsContainer.appendChild(arrow);
                });
            }
        });

        // Draw arrows between heap objects
        heapRefs.forEach((refs, sourceObj) => {
            const sourceAddress = heapObjects.get(sourceObj);
            const sourceElement = heapElements.get(sourceAddress);

            refs.forEach(targetObj => {
                const targetAddress = heapObjects.get(targetObj);
                const targetElement = heapElements.get(targetAddress);

                if (sourceElement && targetElement) {
                    const arrow = drawArrow(sourceElement, targetElement);
                    arrowsContainer.appendChild(arrow);
                }
            });
        });
    }

    function updateArrows() {
        // Clear existing arrows
        arrowsContainer.innerHTML = '';

        // Redraw all arrows
        stackRefs.forEach((stackElements, address) => {
            const heapElement = heapElements.get(address);
            if (heapElement) {
                stackElements.forEach(stackElement => {
                    const arrow = drawArrow(stackElement, heapElement);
                    arrowsContainer.appendChild(arrow);
                });
            }
        });

        // Draw arrows between heap objects
        heapRefs.forEach((refs, sourceObj) => {
            const sourceAddress = heapObjects.get(sourceObj);
            const sourceElement = heapElements.get(sourceAddress);

            refs.forEach(targetObj => {
                const targetAddress = heapObjects.get(targetObj);
                const targetElement = heapElements.get(targetAddress);

                if (sourceElement && targetElement) {
                    const arrow = drawArrow(sourceElement, targetElement);
                    arrowsContainer.appendChild(arrow);
                }
            });
        });
    }

    function executeCode() {
        // Clear previous output and logs
        output.innerHTML = '';
        logs.length = 0;
        stackVariables.clear();
        heapObjects.clear();
        heapRefs.clear();
        stackRefs.clear();
        heapElements.clear();
        nextHeapAddress = 0x1000;

        try {
            // Create a function that will track variable declarations
            const wrappedCode = `
                try {
                    ${codeInput.value}
                    return { vars: { ${Array.from(getVariables(codeInput.value)).join(', ')} } };
                } catch (e) {
                    return { error: e };
                }
            `;

            // Execute the code
            const result = (new Function(wrappedCode))();

            if (result.error) {
                throw result.error;
            }

            // Process and allocate heap objects first
            if (result.vars) {
                Object.values(result.vars).forEach(value => {
                    if (typeof value === 'object' && value !== null) {
                        processHeapObjects(value);
                    }
                });

                // Then update stack variables
                Object.entries(result.vars).forEach(([name, value]) => {
                    stackVariables.set(name, value);
                });
            }

            // Update visualizations
            const stackElements = updateStackVisualization();
            updateHeapVisualization(stackElements);

            // Display any console.log outputs
            if (logs.length > 0) {
                logs.forEach(log => {
                    output.innerHTML += `<div class="success">${escapeHtml(log)}</div>`;
                });
            }

            // Display the return value if it exists and is not undefined
            const lastExprValue = eval(codeInput.value);
            if (lastExprValue !== undefined) {
                output.innerHTML += `<div class="success">=> ${escapeHtml(String(lastExprValue))}</div>`;
            }
        } catch (error) {
            output.innerHTML = `<div class="error">Error: ${escapeHtml(error.message)}</div>`;
        }
    }

    // Helper function to extract variable names from code
    function getVariables(code) {
        const variables = new Set();
        // Match let, const, and var declarations
        const declarationRegex = /(?:let|const|var)\s+([a-zA-Z_$][a-zA-Z0-9_$]*)/g;
        let match;
        while ((match = declarationRegex.exec(code)) !== null) {
            variables.add(match[1]);
        }
        // Match assignment to undeclared variables (implicit globals)
        const assignmentRegex = /(?:^|\s)([a-zA-Z_$][a-zA-Z0-9_$]*)\s*=/g;
        while ((match = assignmentRegex.exec(code)) !== null) {
            variables.add(match[1]);
        }
        return variables;
    }

    // Helper function to escape HTML special characters
    function escapeHtml(unsafe) {
        return unsafe
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    }

    // Debounce function to limit how often the code executes
    function debounce(func, wait) {
        let timeout;
        return function executedFunction(...args) {
            const later = () => {
                clearTimeout(timeout);
                func(...args);
            };
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
        };
    }

    // Create debounced version of executeCode
    const debouncedExecute = debounce(executeCode, 300);

    // Execute code on text changes
    codeInput.addEventListener('input', debouncedExecute);

    // Execute code immediately on page load
    executeCode();
});