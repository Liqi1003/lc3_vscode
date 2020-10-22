export enum bbFlag {
	hasExplored = 0x1,
	hasCheckedDeadCode = 0x2,
	hasCheckedRestore = 0x4,
	hasCheckedCC = 0x8,
}

import {
	Instruction
} from './instruction'

export class BasicBlock {
	public instructions: Instruction[] = []; 			// Instruction at the same memory address
	public subroutine_num: number = NaN;					// Subroutine ID
	public overlapNumber: number = NaN;						// Subroutine ID of the other subroutine, if any
	public next_block: BasicBlock | null = null;  // Next block pointer
	public br_block: BasicBlock | null = null;		// Branch block pointer
	public exit_block: BasicBlock[] = [];  				// Exit blocks of a subroutine, only valid for subroutine start blocks
	public flags: number = 0;											// Flags - see bbFlag structure definition
	public reguse: Array<number>;									// Register use array. 0 for not used, -1 for last access is write, 1 for last access is read
	public savedReg: Array<boolean>; 							// Register save array. true for callee-saved, only valid for entry blocks
	public restoredReg: Array<boolean>; 					// Register restore array. true for callee-saved, only valid for entry and exit blocks
	public cc: Array<boolean>; 										// cc array. cc[0]=n, cc[1]=z, cc[2]=p, true means it is possible to have this cc
	public initial_cc: Array<boolean>; 						// Initial cc array. cc[0]=n, cc[1]=z, cc[2]=p, true means it is possible to have this cc

	constructor() {
		this.reguse = [0, 0, 0, 0, 0, 0, 0, 0];
		this.savedReg = [false, false, false, false, false, false, false, false];
		this.restoredReg = [false, false, false, false, false, false, false, false];
		this.cc = [true, true, true];
		this.initial_cc = [true, true, true];
	}

	// Push an instruction into the basic block
	public pushInstruction(instruction: Instruction) {
		if (this.instructions.length == 0) {
			this.subroutine_num = instruction.subroutine_num;
		}
		this.instructions.push(instruction);
	}

	// Check for dead code in this block
	public checkDeadCode(): Array<number> {
		let idx: number, i: number;
		let instruction: Instruction;
		let reguse1 = null;
		let reguse2 = null;

		if (this.flags & bbFlag.hasCheckedDeadCode) {
			return this.reguse;
		}
		this.flags = this.flags | bbFlag.hasCheckedDeadCode;

		// Get reguse from next blocks
		if (this.next_block) {
			reguse1 = this.next_block.checkDeadCode();
		}
		if (this.br_block) {
			reguse2 = this.br_block.checkDeadCode();
		}

		// Merge reguse
		if (reguse1 && reguse2) {
			for (i = 0; i < 8; i++) {
				this.reguse[i] = Math.max(reguse1[i], reguse2[i]);
			}
		} else if (reguse1) {
			for (i = 0; i < 8; i++) {
				this.reguse[i] = reguse1[i];
			}
		}

		// Iterate backward
		for (idx = this.instructions.length - 1; idx >= 0; idx--) {
			instruction = this.instructions[idx];
			if (!isNaN(instruction.dest) && this.reguse[instruction.dest] == -1) {
				instruction.isDead = true;
				continue;
			}
			if (!isNaN(instruction.dest)) {
				this.reguse[instruction.dest] = -1;
			}
			if (!isNaN(instruction.src)) {
				this.reguse[instruction.src] = 1;
			}
			if (!isNaN(instruction.src2)) {
				this.reguse[instruction.src2] = 1;
			}
		}
		return this.reguse;
	}

	// Check for restored register in this block
	public checkRestoredReg(bb: BasicBlock) {
		let idx: number, i: number;
		let instruction: Instruction;

		if (this.flags & bbFlag.hasCheckedRestore) {
			return this.restoredReg;
		}
		this.flags = this.flags | bbFlag.hasCheckedRestore;

		if (this.next_block) {
			this.next_block.checkRestoredReg(bb);
		}
		if (this.br_block) {
			this.br_block.checkRestoredReg(bb);
		}

		// The last block (return block)
		if (this.isRETBlock()) {
			// Link block with entry block
			bb.exit_block.push(this);
			// Skip the last operation (should be a RET)
			for (idx = this.instructions.length - 2; idx >= 0; idx--) {
				instruction = this.instructions[idx];
				// Not a load operation, give up
				if (instruction.optype != "LD" &&
					instruction.optype != "LDR") {
					break;
				}
				// Record saved registers
				this.restoredReg[instruction.dest] = true;
			}
		}
	}

	// Check CC possibility in this block
	public checkCC(pre_cc: Array<boolean>) {
		let idx: number, i: number;
		let instruction: Instruction;

		// 
		if (this.initial_cc[0] == pre_cc[0] &&
			this.initial_cc[1] == pre_cc[1] &&
			this.initial_cc[2] == pre_cc[2]) {
			return;
		}

		// Merge cc
		for (i = 0; i < 3; i++) {
			this.initial_cc[i] = this.initial_cc[i] || pre_cc[i];
		}

		this.cc = [...this.initial_cc];
		// Iterate through instructions
		for (idx = 0; idx < this.instructions.length; idx++) {
			instruction = this.instructions[idx];
			// Reset CC possiblity
			if (instruction.setCC()) {
				this.cc = [true, true, true];
			}
			// Finds BR
			if (instruction.optype == "BR") {
				instruction.br_possibility = this.compareCC(this.cc, instruction);
				this.cc = [
					this.cc[0] && instruction.n,
					this.cc[1] && instruction.z,
					this.cc[2] && instruction.p
				];
			}
		}

		// Check for next blocks
		if (this.next_block) {
			// Next block
			this.next_block.checkCC([
				!this.cc[0],
				!this.cc[1],
				!this.cc[2]
			]);
		} if (this.br_block) {
			// Branch target
			this.br_block.checkCC([...this.cc]);
		}
	}

	// Compares a CC with a BR instruction. Returns 0 for conditional branch, 1 for always branch, -1 for redundant condition
	private compareCC(cc: Array<boolean>, inst: Instruction): number {
		if ((cc[0] == inst.n) && (cc[1] == inst.z) && (cc[2] == inst.p)) {
			return 1;
		} else if ((!cc[0] && inst.n) || (!cc[1] && inst.z) || (!cc[2] && inst.p)) {
			return -1;
		}
		return 0;
	}

	private isRETBlock(): boolean {
		return (this.instructions[this.instructions.length - 1].optype == "RET");
	}
}
