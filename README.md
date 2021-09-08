# VSCode extension for LC3 assembly language

## INTRODUCTION

The extension aims to help the students in studying LC3 assembly language.

The extension is developed based on **Patt And Patel Introduction To Computing Systems 2nd Edition**.
Note that if you are using another edition of the book, or you are using a different textbook, then you may see some false positive warnings.

This extension does NOT include any analysis for I/O behavior and several new concepts in the 3rd version of LC3, including interrupts and access control violation.

For issues and bug reports, please contact qili8@illinois.edu.

***

## FUNCTIONALITY

## Syntax highlighting

Syntax highlighting for Opcodes, Registers, Numbers and Strings. The highlighting varies based on the VSCode color scheme.

## Auto Completions of keywords and labels

All labels in the file can be autocompleted using VSCode's tab completion.

Also, you can view the example usage of an opcode if you type the opcode and expand the related information window by clicking on the right side of the completion item.

## Goto Definition

You can quickly navigate to the definition of a label by holding Ctrl and then left-click on a label.

## Static checking on the code

The extension provides a variety of checks on your code, including:

### Illegal instructions

Instructions that are incomplete or illegal generates errors.

*This checking is turned off by default to provide better coding experience. This feature will be improved in future versions.*

### Immediate values

Ranges of immediate values are checked. If they exceed the limit of the specific instruction, an error is generated. For AND and ADD, an additional checking on whether encoding issue occurs is performed. A warning is generated when a positive decimal immediate number is used, but the encoding makes it negative.

### Control flow

If the code reaches HALT inside a subroutine, or a RET inside main code, a warning is generated.

### Code before/after .ORIG/.END

Code before and after .ORIG and .END are shown as errors and warnings respectively.

### Data execution

Code that potentially execute data as instructions are warned.

### Code overlap between main code and/or subroutines

Shared code between different subroutines is warned.

### Illegal label names, duplicated labels, multiple labels at the same memory locations

Label names that are not usable, like `X10`, `R3`, `12LABEL` are warned.

Duplicated labels cannot appear in the same file. An error is generated for labels that have appeared before.

Having multiple labels at the same memory location is not a fatal issue, but it illustrates structural defect in the code. Thus, a warning is generated.

### Condition codes

If a branch instruction contains redundant condition code, a warning is generated.

If a branch instruction is conditional, but the condition is always true, a warning is generated.

### Unreachable instructions in the code

Unreachable instructions are the instructions that can never be executed unless one manually set PC to the corresponding address. The problem is caused by the control flow.

### Dead code

Code that has no effect in the program is grayed out. It is recommended to remove dead code for better readability.

**Warning: Some code may be marked as dead because they do not have effect in the current scope. It is the programmer's responsibility to decide whether to remove them or not.**

### Subroutine analysis

Reports the callee-saved registers in a subroutine if they are laid out as consecutive ST's right after the subroutine label, and consecutive LD's right before RET. Any mismatch of saving and restoring registers is warned.

### Uncalled subroutines

Uncalled subroutine is warned. If you want to write a subroutine before writing the invocation somewhere else, you can prevent this warning by adding a comment `; @SUBROUTINE` in the line right above the subroutine label. You can also do so by using the quick fix provided when you hover over the subroutine label.

### Unrolled loops

Consecutive repeated code blocks are recognized as an "unrolled loop", which means a loop may be used in place of the repeated code. It is a good practice to write loops or subroutines to perform repetitive work, rather than copy and paste code.  

***

## Configurations

### Version

Version of the LC3 assembler. Note that this option only changes LEA and TRAP behavior.

### Show Errors

Controls whether to show all errors.

### Show Warnings

Controls whether to show all warnings.

### Show Illegal Instructions

Controls whether to generate error message when an illegal instruction is present.

*This option is turned off by default to provide better coding experience.*

### Enable Subroutine Checking

Enables subroutine analysis for calling interfaces and callee-saved registers.

### Enable Unrolled Loop Checking

Enables the detection of consecutively repeated code (unrolled loop).

***

## COPYRIGHT

Copyright © 2020 qili8@illinois.edu

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the “Software”), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED “AS IS”, WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
