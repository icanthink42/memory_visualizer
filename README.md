# JavaScript REPL

A simple web-based JavaScript REPL (Read-Eval-Print Loop) interface that allows you to execute JavaScript code in real-time.

## Features

- Clean, modern interface
- Real-time JavaScript code execution
- Console output capture
- Error handling and display
- Keyboard shortcut support (Ctrl/Cmd + Enter to run)
- Syntax highlighting (via monospace font)

## Usage

1. Open `index.html` in your web browser
2. Enter JavaScript code in the input area
3. Click "Run" or press Ctrl/Cmd + Enter to execute the code
4. View the output in the output area below

## Examples

Try these examples in the REPL:

```javascript
// Basic arithmetic
2 + 2

// Console logging
console.log("Hello, World!");

// Working with objects
const person = { name: "John", age: 30 };
console.log(person);

// Using loops
for (let i = 0; i < 3; i++) {
    console.log(`Iteration ${i}`);
}
```

## Security Note

The REPL uses `eval()` to execute JavaScript code. This is fine for learning and experimentation in a local environment, but should not be used in production without proper security measures.
