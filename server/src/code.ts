import Stack from 'ts-data.stack/stack';

import {
  BasicBlock,
} from "./basicBlock";

import {
  TRAPVEC,
  Instruction,
  Label,
  CC,
  INSTFLAG,
} from './instruction'

export class Code {
  public instructions: Instruction[] = [];                      // Instructions array
  public labels: Label[] = [];                                  // Labels array
  public basicBlocks: BasicBlock[] = [];                        // Basic blocks
  public startAddr: number = NaN;                              // Start address marked by .ORIG
  public endAddr: number = NaN;                                // End address marked by .END
  private firstInstrIdx: number = NaN;                          // First instruction index after .ORIG
  private lineNum: number = 0;                                 // Keeps track of current line number
  private memAddr: number = NaN;                               // Keep track of current memory address
  private stack: Stack<Instruction> = new Stack<Instruction>(); // Stack used for building CFG

  constructor(text: string) {
    this.buildInstructions(text);
    this.linkLabels();
    this.analyzeCFG();
    this.markSubroutines(text);
    this.analyzeCode();
    this.buildBlocks();
    this.analyzeBlocks();
  }

  private buildInstructions(text: string) {
    let lines = text.split('\n');
    let instruction: Instruction;
    let idx: number, i: number;
    let line: string;

    // Construct each instruction
    for (idx = 0; idx < lines.length; idx++) {
      line = lines[idx];
      // Preprocess the line, removing spaces and comments
      line = line.trim();
      for (i = 0; i < line.length; i++) {
        if (line[0] == ';' || (line[i] == ';' && (line[i - 1] == ' ' || line[i - 1] == '\t'))) {
          line = line.slice(0, i);
          break;
        }
      }
      if (line) {
        instruction = new Instruction(line);
        // Handle .STRINGZ in multiple line manner
        if (instruction.optype == ".STRINGZ" && instruction.mem &&
          instruction.mem[instruction.mem.length - 1] != '"') {
          while (++idx < lines.length) {
            this.lineNum++
            instruction.mem = instruction.mem + '\n';
            line = lines[idx];
            line = line.trim();
            for (i = 0; i < line.length; i++) {
              if (line[i] == ';') {
                line = line.slice(0, i);
                break;
              }
            }
            instruction.mem = instruction.mem + line;
            if (line[line.length - 1] == '"') {
              break;
            }
          }
        }
        this.pushInstruction(instruction);

        // Handle instructions/directives right behind labels
        if (instruction.optype == "LABEL") {
          line = line.slice(instruction.mem.length).trim();
          if (line) {
            instruction = new Instruction(line);
            this.pushInstruction(instruction);
          }
        }
      }
      this.lineNum++;
    }

    // Mark the first instruction
    if (isNaN(this.startAddr)) {
      this.firstInstrIdx = 0;
    } else {
      for (idx = 0; idx < this.instructions.length; idx++) {
        instruction = this.instructions[idx];
        if (instruction.memAddr == this.startAddr) {
          this.firstInstrIdx = idx;
        }
      }
    }
    console.log(this);
  }

  // Push an instruction according to its type (push/not push/push to label)
  private pushInstruction(instruction: Instruction) {
    let label: Label;
    let i: number;
    // Keep track of line numbers
    instruction.line = this.lineNum;

    // Handle .ORIG and .END here
    if (instruction.optype == ".ORIG" && isNaN(this.startAddr)) {
      this.memAddr = instruction.memAddr;
      this.startAddr = this.memAddr;
    } else if (instruction.optype == ".END" && isNaN(this.endAddr)) {
      this.endAddr = this.memAddr;
    } else {
      instruction.memAddr = this.memAddr++;
    }

    // Decide what to do according to optype
    switch (instruction.optype) {
      case ".ORIG":
      case ".END":
        break;
      case ".FILL":
        this.instructions.push(instruction);
        break;
      case ".BLKW":
        if (!isNaN(instruction.immVal)) {
          this.memAddr += instruction.immVal - 1;
        }
        this.instructions.push(instruction);
        break;
      case ".STRINGZ":
        if (!isNaN(instruction.mem.length)) {
          instruction.mem.slice(1, instruction.mem.length - 1);
          this.memAddr += instruction.mem.length;
        }
        for (i = 0; i < instruction.mem.length; i++) {
          // Take out the '\' characters
          if (instruction.mem[i] == '\\') {
            this.memAddr--;
          }
        }
        instruction.rawString = ".STRINGZ " + instruction.mem;
        this.instructions.push(instruction);
        break;
      case "LABEL":
        // Labels do not occupy memory addresses
        this.memAddr--;
        label = new Label(instruction);
        this.labels.push(label);
        break;
      default:
        this.instructions.push(instruction);
        break;
    }
  }

  // Link labels with the instruction at that memory location
  private linkLabels() {
    let label_idx: number, instruction_idx: number;
    // Skip labels and instructions before .ORIG
    for (label_idx = 0; label_idx < this.labels.length && this.labels[label_idx].memAddr == 0; label_idx++);
    for (instruction_idx = 0; instruction_idx < this.instructions.length && this.instructions[instruction_idx].memAddr == 0; instruction_idx++);

    // Feeling lazy, may revise the structure here
    for (instruction_idx = 0; instruction_idx < this.instructions.length; instruction_idx++) {
      for (label_idx = 0; label_idx < this.labels.length; label_idx++) {
        if (this.instructions[instruction_idx].memAddr == this.labels[label_idx].memAddr) {
          this.labels[label_idx].instruction = this.instructions[instruction_idx];
        }
      }
    }
  }

  // Build the CFG of the given code
  private analyzeCFG() {
    let idx: number, i: number;
    let instruction: Instruction;
    let next: Instruction | null;

    for (idx = 0; idx < this.instructions.length; idx++) {
      instruction = this.instructions[idx];
      // Skip data
      if (instruction.memAddr == 0 || instruction.isData()) {
        continue;
      }
      // Mark the first instruction to be accessiable from start
      if (instruction.memAddr == this.startAddr) {
        instruction.incomingArcs = 1;
      }
      // Link instructions
      if (idx + 1 < this.instructions.length) {
        instruction.nextInstruction = this.instructions[idx + 1];
      }
      if (instruction.optype == "JSR") {
        // JSR
        instruction.jsrTarget = this.getTarget(idx);
      } else if (instruction.optype == "BR") {
        // BR
        instruction.brTarget = this.getTarget(idx);
        if (instruction.brTarget && instruction.cc == CC.nzp) {
          instruction.nextInstruction = null;
        }
      } else if (instruction.optype == "RET" ||
        (instruction.optype == "TRAP" && instruction.immVal == TRAPVEC.HALT)) {
        // RET and HALT do not have nextInstruction
        instruction.nextInstruction = null;
      }
    }
    for (idx = 0; idx < this.instructions.length; idx++) {
      // Next instruction
      next = this.instructions[idx].nextInstruction;
      if (next) {
        next.incomingArcs++;
      }
      // Branch target
      next = this.instructions[idx].brTarget;
      if (next) {
        next.incomingArcs++;
      }
    }
  }

  // Mark subroutines according to #pragma
  private markSubroutines(text: string) {
    let lines = text.split('\n');
    let idx: number;
    let instruction: Instruction, target: Instruction;
    let line: string;
    let label: Label;

    // Mark subroutines with JSR
    for (idx = 0; idx < this.instructions.length; idx++) {
      instruction = this.instructions[idx];
      if (instruction.jsrTarget) {
        target = instruction.jsrTarget;
        target.flags |= INSTFLAG.isSubroutineStart;
        target.subroutineNum = target.memAddr;
      }
    }

    // Iterate through all lines except for the last line for pragma
    for (idx = 0; idx < lines.length - 1; idx++) {
      line = lines[idx];
      if (line.match("@SUBROUTINE")) {
        label = this.findLabelByLine(idx + 1);
        if (label.instruction) {
          label.instruction.flags |= INSTFLAG.isSubroutineStart;
          label.instruction.subroutineNum = label.instruction.memAddr;
        }
      }
    }
  }

  // Returns the label at the specified line number (assuming line number is always legal)
  private findLabelByLine(line: number): Label {
    let idx: number;
    let label: Label;
    for (idx = 0; idx < this.labels.length; idx++) {
      label = this.labels[idx];
      if (label.line == line) {
        return label;
      }
    }
    // Returns an empty label, required by compiler
    return new Label(new Instruction(""));
  }

  // Analyze code
  private analyzeCode() {
    let idx: number;
    let instruction: Instruction;
    // Analyze main code
    if (this.instructions.length > 0) {
      this.iterateCode(this.instructions[this.firstInstrIdx], this.startAddr);
    }

    // Analyze subroutines
    for (idx = 0; idx < this.instructions.length; idx++) {
      instruction = this.instructions[idx];
      if (instruction.flags & INSTFLAG.isSubroutineStart) {
        this.iterateCode(instruction, instruction.subroutineNum);
      }
    }
  }

  // Iterate through code to detect unreachable code
  private iterateCode(initial_instruction: Instruction, subroutineNum: number) {
    let cur_instruction: Instruction;
    let next_instrcution: Instruction | null;

    if (initial_instruction.flags & INSTFLAG.isSubroutineStart &&
      initial_instruction.subroutineNum != subroutineNum) {
      initial_instruction.codeOverlap = subroutineNum;
    } else {
      initial_instruction.flags |= INSTFLAG.isFound;
      initial_instruction.subroutineNum = subroutineNum;
      this.stack.push(initial_instruction);
    }

    while (!this.stack.isEmpty()) {
      // Pop one instruction
      cur_instruction = this.stack.pop();
      // Next instruction
      next_instrcution = cur_instruction.nextInstruction;
      if (next_instrcution) {
        this.pushToStack(next_instrcution, subroutineNum);
      }
      // Branch target
      next_instrcution = cur_instruction.brTarget;
      if (next_instrcution) {
        this.pushToStack(next_instrcution, subroutineNum);
      }
    }
  }

  // Do the checking and push one instruction onto stack
  private pushToStack(instruction: Instruction, subroutineNum: number) {
    if (instruction.flags & INSTFLAG.isSubroutineStart) {
      instruction.codeOverlap = subroutineNum;
    } else if (!(instruction.flags & INSTFLAG.isFound)) {
      instruction.flags |= INSTFLAG.isFound;
      instruction.subroutineNum = subroutineNum;
      this.stack.push(instruction);
    } else if (instruction.subroutineNum != subroutineNum) {
      // Have seen this instruction, check for code overlap
      instruction.codeOverlap = subroutineNum;
    }
  }

  // Get the instruction according to label
  private getTarget(idx: number): Instruction | null {
    let i: number;
    for (i = 0; i < this.labels.length; i++) {
      if (this.labels[i].name == this.instructions[idx].mem) {
        return this.labels[i].instruction;
      }
    }
    return null;
  }

  private buildBlocks() {
    let bb: BasicBlock;
    let instruction: Instruction;
    let idx: number;

    // Explore the main routine
    bb = this.buildOneBlock(this.instructions[this.firstInstrIdx], this.startAddr);
    this.basicBlocks.push(bb);

    // Explore subroutines
    for (idx = 0; idx < this.instructions.length; idx++) {
      instruction = this.instructions[idx];
      if (instruction.flags & INSTFLAG.isSubroutineStart) {
        bb = this.buildOneBlock(instruction, instruction.subroutineNum);
        this.basicBlocks.push(bb);
      }
    }
  }

  // Helper function to build one basic block
  private buildOneBlock(instruction: Instruction, subroutineNum: number): BasicBlock {
    let bb: BasicBlock | null;
    let cur: Instruction | null, next: Instruction | null;

    cur = instruction;
    bb = cur.inBlock;
    // Instruction already in a basic block
    if (bb != null) {
      // Accessd from another routine
      if (bb.subroutineNum != subroutineNum) {
        bb.overlapNumber = subroutineNum;
      }

      return bb;
    }

    // Create a new basic block
    bb = new BasicBlock();
    cur.inBlock = bb;
    bb.pushInstruction(cur);

    // Get next instruction
    next = cur.nextInstruction;
    while (!cur.endBasicBlock() && cur.brTarget == null && cur.jsrTarget == null &&
      next && next.incomingArcs == 1) {
      // Push next instruction into this basic block
      bb.pushInstruction(next);
      next.inBlock = bb;

      // Go to the next instruction
      cur = next;
      next = cur.nextInstruction;
    }

    // One instruction ends the current basic block
    // If it has a next instruction
    if (cur.nextInstruction) {
      bb.nextBlock = this.buildOneBlock(cur.nextInstruction, subroutineNum);
    }
    // If it has a branch target
    if (cur.brTarget) {
      bb.brBlock = this.buildOneBlock(cur.brTarget, subroutineNum);
    }

    // Return the built basic block
    return bb;
  }

  private analyzeBlocks() {
    let idx: number;
    for (idx = 0; idx < this.basicBlocks.length; idx++) {
      this.basicBlocks[idx].checkDeadCode();
      // this.basicBlocks[idx].checkCC([false, false, false]);
      // Only check for save-restore registers in subroutines
      if (idx > 0) {
        this.basicBlocks[idx].checkRestoredReg(this.basicBlocks[idx]);
      }
    }
  }
}
