import Stack from 'ts-data.stack/stack';

import {
  TRAPVEC,
  Instruction,
  Label
} from './instruction'

export class Code {
  public start_addr: number;
  public end_addr: number;
  public instructions: Instruction[];
  public labels: Label[];
  private line_num: number;
  private mem_addr: number;
  private stack: Stack<Instruction>;

  constructor(text: string) {
    this.start_addr = NaN;
    this.end_addr = NaN;
    this.instructions = [];
    this.labels = [];
    this.line_num = 0;
    this.mem_addr = NaN;
    this.stack = new Stack<Instruction>();

    this.buildInstructions(text);
    this.linkLabels();
    this.analyzeCFG();
    this.markSubroutines(text);
    this.analyzeCode();
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
        }
      }
      if (line) {
        instruction = new Instruction(line);
        this.pushInstruction(instruction);

        // Handle instructions/directives right behind labels
        if (instruction.optype == "LABEL") {
          line = line.slice(line.split(/\s/)[0].length + 1).trim();
          if (line) {
            instruction = new Instruction(line);
            this.pushInstruction(instruction);
          }
        }
      }
      this.line_num++;
    }
    // console.log(this);
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

    switch (instruction.optype) {
      case ".ORIG":
      case ".END":
        break;
      case ".FILL":
        this.instructions.push(instruction);
        break;
      case ".BLKW":
        this.mem_addr += instruction.imm_val - 1;
        this.instructions.push(instruction);
        break;
      case ".STRINGZ":
        this.mem_addr += instruction.mem.length;
        for (i = 0; i < instruction.mem.length; i++) {
          // Take out the '\' characters
          if (instruction.mem[i] == '\\') {
            this.mem_addr--;
          }
        }
        this.instructions.push(instruction);
        break;
      case "LABEL":
        // Labels do not occupy memory addresses
        this.mem_addr--;
        label = new Label(instruction);
        this.labels.push(label);
        break;
      case "BR":
        if (instruction.illegal_cc) {
          label = new Label(instruction);
          label.isBR = true;
          this.labels.push(label);
        } else {
          this.instructions.push(instruction);
        }
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

    for (idx = 0; idx < this.instructions.length; idx++) {
      instruction = this.instructions[idx];
      // Skip data
      if (instruction.mem_addr == 0 || instruction.is_data) {
        continue;
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
        if (instruction.n && instruction.z && instruction.p) {
          instruction.next_instruction = null;
        }
      } else if (instruction.optype == "RET" ||
        (instruction.optype == "TRAP" && instruction.imm_val == TRAPVEC.HALT)) {
        // RET and HALT do not have next_instruction
        instruction.next_instruction = null;
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
      this.iterate_code(this.instructions[0], this.start_addr);
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
}
