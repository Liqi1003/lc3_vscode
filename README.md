# VScode extension for LC3 assembly code

<font color=#1E90FF size=5 >
Introduction
</font><br>
<br>
This extension is aimed to help the students in studying of LC3 assembly language. 

It is developed based on **Patt And Patel Introduction To Computing Systems 2nd Edition**.

Note that if you are using another edition of the book, or you are using a different textbook, then you may see some false positive warnings.

For issues and bug reports, please contact qili8@illinois.edu

***

<font color=#1E90FF size=5 >
Functionality
</font><br>
<br>
<font color=#1E90FF size=4 >
Syntax highlighting
</font><br>

Syntax highlighting for Opcodes, Registers, Numbers and Strings. It varies with your VScode colorscheme.

<font color=#1E90FF size=4 >
Static checking on the code
</font><br>

The extension provides a variety of checkings on your code, including:

<font color=#6495ED size=3 >
Illegal instructions
</font><br>

Instructions that are incomplete or illegal will generate errors.

<font color=#6495ED size=3 >
Immediate values
</font><br>

Ranges of immediate values are checked. If they exceeds the limit of the specific instruction, an error will be generated for control instructions and a warning will be generated for arithmetic instructions respectively.

<font color=#6495ED size=3 >
Control flow
</font><br>

If the code reaches HALT inside a subroutine, or a RET inside main code, then a warning will be generated.

<font color=#6495ED size=3 >
Code before/after .ORIG/.END
</font><br>

Code before or after .ORIG and .END are shown as errors and warnings respectively.

<font color=#6495ED size=3 >
Data execution
</font><br>

Code that potantially execute data as instructions are warned.

<font color=#6495ED size=3 >
Code overlap between main code and/or subroutines
</font><br>

Shared code between different subroutines will be warned.

<font color=#6495ED size=3 >
Illegal label names, duplicated labels, multiple labels at the same memory locations
</font><br>

Label names that are not usable, like `X10`, `R3` will be warned.

Duplicated labels cannot appear in the same file.

Multiple labels at the same memory location is not a fatal issue, but it may illustrate some structural defect in the code.

<font color=#6495ED size=3 >
Condition codes
</font><br>

If a branch instruction contains redundant condition code, a warning will be generated.

If a branch instruction is conditional but the condition is always true, a warning will be generated.

<font color=#6495ED size=3 >
Unreachable instructions in the code
</font><br>

Unreachable instructions are caused by the control flow. The LC3 machine can never execute those instructions unless you directly set PC to it.

<font color=#6495ED size=3 >
Dead code
</font><br>

Code that has no effect in the overall program will be shown as "dead". It is recommended to remove dead code for better redability. 

<font color=#FFA500 size=3 >
Warning: Some code may be marked as dead because they do not have effect in the current scope. It is the programmer's responsibility to decide whether to remove them or not.
</font><br>
<br>
<font color=#6495ED size=3 >
Subroutine analysis
</font><br>

Reports the callee-saved registers in a subroutine if they are laid out as consecutive ST's right after the subroutine label, and consetutive LD's right before RET. Any mismatch of saving and restoring registers will be warned.

<font color=#6495ED size=3 >
Uncalled subroutines
</font><br>

If you want to write a subroutine before writing the invocation somewhere else, you can prevent this warning by adding a comment `; @SUBROUTINE` in the line right above the subroutine label. You can also do this by using the quick fix provided when you select the subroutine label.

<font color=#6495ED size=4 >
Auto Completions of keywords and labels
</font><br>

All labels in the file can be autocompleted using VScode's tab completion.

Also, you can see the example usage of different opcodes if you type it and see "related information".

***

<font color=#1E90FF size=5 >
Configurations
</font><br>
<br>
<font color=#1E90FF size=4 >
showErrors
</font><br>

Controls whether to show all errors.

<font color=#1E90FF size=4 >
showWarnings
</font><br>

Controls whether to show all warnings.

<font color=#1E90FF size=4 >
showIllegalInstructions
</font><br>

Controls whether to generate error message when an illegal instruction is present. 

*This option is turned off by default to provide better coding experience.*

<font color=#1E90FF size=4 >
enableSubroutineCheckings
</font><br>

Enables subroutine analysis for calling interfaces, saved registers etc.

***

<font color=#1E90FF size=5 >
COPYRIGHT
</font><br>
<br>
Copyright © 2020 <qili@illinois.edu>

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the “Software”), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED “AS IS”, WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
