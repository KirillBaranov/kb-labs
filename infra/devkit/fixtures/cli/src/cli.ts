#!/usr/bin/env node

import { program } from 'commander'

program
  .name('fixture-cli')
  .description('A sample CLI application using DevKit presets')
  .version('1.0.0')

program
  .command('greet')
  .description('Greet someone')
  .argument('<name>', 'Name to greet')
  .option('-e, --excited', 'Add exclamation mark')
  .action((name: string, options: { excited?: boolean }) => {
    const greeting = `Hello, ${name}${options.excited ? '!' : '.'}`
    console.log(greeting)
  })

program
  .command('calculate')
  .description('Perform basic calculations')
  .argument('<operation>', 'Operation: add, subtract, multiply, divide')
  .argument('<a>', 'First number', parseFloat)
  .argument('<b>', 'Second number', parseFloat)
  .action((operation: string, a: number, b: number) => {
    let result: number
    switch (operation) {
      case 'add':
        result = a + b
        break
      case 'subtract':
        result = a - b
        break
      case 'multiply':
        result = a * b
        break
      case 'divide':
        if (b === 0) {
          console.error('Error: Division by zero')
          process.exit(1)
        }
        result = a / b
        break
      default:
        console.error(`Error: Unknown operation "${operation}"`)
        process.exit(1)
    }
    console.log(`Result: ${result}`)
  })

program.parse()
