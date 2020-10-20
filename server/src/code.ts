import Stack from 'ts-data.stack/stack';

import {
  BasicBlock
} from "./basicBlock";

import {
  TRAPVEC,
  Instruction,
  Label
} from './instruction'

export class Code {
  public instructions: Instruction[] = [];                      // Instructions array
  public labels: Label[] = [];                                  // Labels array
  public basicBlocks: BasicBlock[] = [];                        // Basic blocks
  public start_addr: number = NaN;                              // Start address marked by .ORIG
  public end_addr: number = NaN;                                // End address marked by .END
  private firstInstrIdx: number = NaN;                          // First instruction index after .ORIG
  private line_num: number = 0;                                 // Keeps track of current line number
  private mem_addr: number = NaN;                               // Keep track of current memory address
  private stack: Stack<Instruction> = new Stack<Instruction>(); // Stack used for building CFG

  constructor(text: string) {
    this.buildInstructions(text);
    this.linkLabels();
    this.analyzeCFG();
    this.markSubroutines(text);
    this.analyzeCode();
    this.buildBlocks();
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
        // TODO: Handle .STRINGZ in multiple line manner
        if (instruction.optype == ".STRINGZ" && instruction.mem &&
          instruction.mem[instruction.mem.length - 1] != '"') {
          while (++idx < lines.length) {
            this.line_num++
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
          line = line.slice(line.split(/\s/)[0].length).trim();
          if (line) {
            instruction = new Instruction(line);
            this.pushInstruction(instruction);
          }
        }
      }
      this.line_num++;
    }
    for (idx = 0; idx < this.instructions.length; idx++) {
      instruction = this.instructions[idx];
      if (instruction.mem_addr == this.start_addr) {
        this.firstInstrIdx = idx;
      }
    }
    console.log(this);
  }

  // Push an instruction according to its type (push/not push/push to label)
  private pushInstruction(instruction: Instruction) {
    let label: Label;
    let i: number;
    // Keep track of line numbers
    instruction.line = this.line_num;

    // Handle .ORIG and .END here
    if (instruction.optype == ".ORIG" && isNaN(this.start_addr)) {
      this.mem_addr = instruction.mem_addr;
      this.start_addr = this.mem_addr;
    } else if (instruction.optype == ".END" && isNaN(this.end_addr)) {
      this.end_addr = this.mem_addr;
    } else {
      instruction.mem_addr = this.mem_addr++;
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
        if (!isNaN(instruction.imm_val)) {
          this.mem_addr += instruction.imm_val - 1;
        }
        this.instructions.push(instruction);
        break;
      case ".STRINGZ":
        if (!isNaN(instruction.mem.length)) {
          instruction.mem.slice(1, instruction.mem.length - 1);
          this.mem_addr += instruction.mem.length;
        }
        for (i = 0; i < instruction.mem.length; i++) {
          // Take out the '\' characters
          if (instruction.mem[i] == '\\') {
            this.mem_addr--;
          }
        }
        instruction.raw_string = ".STRINGZ " + instruction.mem;
        this.instructions.push(instruction);
        break;
      case "LABEL":
        // Labels do not occupy memory addresses
        this.mem_addr--;
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
    for (label_idx = 0; label_idx < this.labels.length && this.labels[label_idx].mem_addr == 0; label_idx++);
    for (instruction_idx = 0; instruction_idx < this.instructions.length && this.instructions[instruction_idx].mem_addr == 0; instruction_idx++);

    // Feeling lazy, may revise the structure here
    for (instruction_idx = 0; instruction_idx < this.instructions.length; instruction_idx++) {
      for (label_idx = 0; label_idx < this.labels.length; label_idx++) {
        if (this.instructions[instruction_idx].mem_addr == this.labels[label_idx].mem_addr) {
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
      if (instruction.mem_addr == 0 || instruction.isData()) {
        continue;
      }
      // Mark the first instruction to be accessiable from start
      if (instruction.mem_addr == this.start_addr) {
        instruction.incoming_arcs = 1;
      }
      // Link instructions
      if (idx + 1 < this.instructions.length) {
        instruction.next_instruction = this.instructions[idx + 1];
      }
      if (instruction.optype == "JSR") {
        // JSR
        instruction.jsr_target = this.get_target(idx);
      } else if (instruction.optype == "BR") {
        // BR
        instruction.br_target = this.get_target(idx);
        if (instruction.br_target && instruction.n && instruction.z && instruction.p) {
          instruction.next_instruction = null;
        }
      } else if (instruction.optype == "RET" ||
        (instruction.optype == "TRAP" && instruction.imm_val == TRAPVEC.HALT)) {
        // RET and HALT do not have next_instruction
        instruction.next_instruction = null;
      }
    }
    for (idx = 0; idx < this.instructions.length; idx++) {
      // Next instruction
      next = this.instructions[idx].next_instruction;
      if (next) {
        next.incoming_arcs++;
      }
      // Branch target
      next = this.instructions[idx].br_target;
      if (next) {
        next.incoming_arcs++;
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
      if (instruction.jsr_target) {
        target = instruction.jsr_target;
        target.is_subroutine_start = true;
        target.subroutine_num = target.mem_addr;
      }
    }

    // Iterate through all lines except for the last line for pragma
    for (idx = 0; idx < lines.length - 1; idx++) {
      line = lines[idx];
      if (line.match("@SUBROUTINE")) {
        label = this.findLabelByLine(idx + 1);
        if (label.instruction) {
          label.instruction.is_subroutine_start = true;
          label.instruction.subroutine_num = label.instruction.mem_addr;
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
      this.iterate_code(this.instructions[this.firstInstrIdx], this.start_addr);
    }

    // Analyze subroutines
    for (idx = 0; idx < this.instructions.length; idx++) {
      instruction = this.instructions[idx];
      if (instruction.is_subroutine_start) {
        this.iterate_code(instruction, instruction.subroutine_num);
      }
    }
  }

  // Iterate through code to detect unreachable code
  private iterate_code(initial_instruction: Instruction, subroutine_num: number) {
    let cur_instruction: Instruction;
    let next_instrcution: Instruction | null;

    if (initial_instruction.is_subroutine_start &&
      initial_instruction.subroutine_num != subroutine_num) {
      initial_instruction.code_overlap = subroutine_num;
    } else {
      initial_instruction.is_found = true;
      initial_instruction.subroutine_num = subroutine_num;
      this.stack.push(initial_instruction);
    }

    while (!this.stack.isEmpty()) {
      // Pop one instruction
      cur_instruction = this.stack.pop();
      // Next instruction
      next_instrcution = cur_instruction.next_instruction;
      if (next_instrcution) {
        this.pushToStack(next_instrcution, subroutine_num);
      }
      // Branch target
      next_instrcution = cur_instruction.br_target;
      if (next_instrcution) {
        this.pushToStack(next_instrcution, subroutine_num);
      }
    }
  }

  // Do the checking and push one instruction onto stack
  private pushToStack(instruction: Instruction, subroutine_num: number) {
    if (instruction.is_subroutine_start) {
      instruction.code_overlap = subroutine_num;
    } else if (!instruction.is_found) {
      instruction.is_found = true;
      instruction.subroutine_num = subroutine_num;
      this.stack.push(instruction);
    } else if (instruction.subroutine_num != subroutine_num) {
      // Have seen this instruction, check for code overlap
      instruction.code_overlap = subroutine_num;
    }
  }

  // Get the instruction according to label
  private get_target(idx: number): Instruction | null {
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
    bb = this.buildOneBlock(this.instructions[this.firstInstrIdx], this.start_addr);
    this.basicBlocks.push(bb);

    // Explore subroutines
    for (idx = 0; idx < this.instructions.length; idx++) {
      instruction = this.instructions[idx];
      if (instruction.is_subroutine_start) {
        bb = this.buildOneBlock(instruction, instruction.subroutine_num);
        this.basicBlocks.push(bb);
      }
    }
  }

  // Helper function to build one basic block
  private buildOneBlock(instruction: Instruction, subroutine_num: number): BasicBlock {
    let bb: BasicBlock | null;
    let cur: Instruction | null, next: Instruction | null;

    cur = instruction;
    bb = cur.in_block;
    // Instruction already in a basic block
    if (bb != null) {
      // Accessd from another routine
      if (bb.subroutine_num != subroutine_num) {
        bb.overlapNumber = subroutine_num;
      }

      return bb;
    }

    // Create a new basic block
    bb = new BasicBlock();
    cur.in_block = bb;
    bb.pushInstruction(cur);

    // Get next instruction
    next = cur.next_instruction;
    while (!cur.endBasicBlock() && cur.br_target == null && cur.jsr_target == null &&
      next && next.incoming_arcs == 1) {
      // Push next instruction into this basic block
      bb.pushInstruction(next);
      next.in_block = bb;

      // Go to the next instruction
      cur = next;
      next = cur.next_instruction;
    }

    // One instruction ends the current basic block
    // If it has a next instruction
    if (cur.next_instruction) {
      bb.next_block.push(this.buildOneBlock(cur.next_instruction, subroutine_num))
    }
    // If it has a branch target
    if (cur.br_target) {
      bb.next_block.push(this.buildOneBlock(cur.br_target, subroutine_num))
    }

    // Return the built basic block
    return bb;
  }
}
