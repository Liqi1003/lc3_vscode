export enum BBFLAG {
	none = 0x0,
	hasExplored = 0x1,
	hasCheckedBackward = 0x2,
	hasCheckedForward = 0x4,
	hasChange = 0x8,
	hasBR = 0x10,
	hasSetCC = 0x20,
}

import {
	CC,
	INSTFLAG,
	Instruction,
} from './instruction'

export enum REGFLAG {
	none = 0x0,
	S = 0x1,				// Saved
	R = 0x2,				// Restored
	SR = 0x3,				// Saved and Restored
	INPUT = 0x4, 		// Not initialized before used
}

export enum REGSTAT {
	none = 0x0,	// Not used
	W = 0x1,		// Last written
	R = 0x2,		// Last read
	RW = 0x3,		// Last read and written
}

export class BasicBlock {
	public instructions: Instruction[] = []; 			// Instruction at the same memory address
	public subroutineNum: number = NaN;					  // Subroutine ID
	public overlapNumber: number = NaN;						// Subroutine ID of the other subroutine, if any
	public nextBlock: BasicBlock | null = null;   // Next block pointer
	public brBlock: BasicBlock | null = null;		  // Branch block pointer
	public exitBlock: BasicBlock[] = [];  				// Exit blocks of a subroutine, only valid for subroutine start blocks
	public flags: number = BBFLAG.none;						// Flags - see BBFLAG structure definition
	public registers: Registers = new Registers;	// Registers
	// public regstat: Array<REGSTAT>;								// Register use array. The 9th element is for CC.
	// public regflag: Array<REGFLAG>;								// Register flag array.
	// public savedRegMem: Array<string>; 						// Register save information: which memory location is saved to
	public cc: CC = CC.none; 											// CC, see CC definition in instruction.ts. 1 means the CC is possible to appear in the condition code
	public initialCC: CC = CC.none; 							// Initial CC, 1 means the CC is possible to appear in the condition code

	constructor() {
		// this.regstat = [REGSTAT.none, REGSTAT.none, REGSTAT.none, REGSTAT.none,
		// REGSTAT.none, REGSTAT.none, REGSTAT.none, REGSTAT.none, REGSTAT.none];  // Added one extra slot for cc
		// this.regflag = [REGFLAG.none, REGFLAG.none, REGFLAG.none, REGFLAG.none,
		// REGFLAG.none, REGFLAG.none, REGFLAG.none, REGFLAG.none];
		// this.savedRegMem = ["", "", "", "", "", "", "", ""];
		// Allocate 8 registers
	}

	// Push an instruction into the basic block
	public pushInstruction(instruction: Instruction) {
		if (this.instructions.length == 0) {
			this.subroutineNum = instruction.subroutineNum;
		}
		this.instructions.push(instruction);
	}

	// Check for dead code in this block
	public analyzeBackward(bb: BasicBlock): Array<REGSTAT> {
		let regstat1 = null;
		let regstat2 = null;

		if (this.flags & BBFLAG.hasCheckedBackward) {
			return this.registers.getStats();
		}
		this.flags |= BBFLAG.hasCheckedBackward;

		// Get regstat from next blocks, merge them
		if (this.nextBlock) {
			regstat1 = this.nextBlock.analyzeBackward(bb);
			for (let i = 0; i < 8; i++) {
				this.registers.regs[i].status |= regstat1[i];
			}
		}
		if (this.brBlock) {
			// On backward branches, don't make any assumptions
			if (this.brBlock.flags & BBFLAG.hasCheckedBackward) {
				regstat2 = [REGSTAT.RW, REGSTAT.RW, REGSTAT.RW, REGSTAT.RW,
				REGSTAT.RW, REGSTAT.RW, REGSTAT.RW, REGSTAT.RW, REGSTAT.RW,];
			} else {
				regstat2 = this.brBlock.analyzeBackward(bb);
			}
			for (let i = 0; i < 8; i++) {
				this.registers.regs[i].status |= regstat2[i];
			}
		}

		this.analyzeInstructionsBackward(bb);
		return this.registers.getStats();
	}

	private analyzeInstructionsBackward(bb: BasicBlock) {
		let instruction: Instruction;

		// Iterate backward
		for (let idx = this.instructions.length - 1; idx >= 0; idx--) {
			instruction = this.instructions[idx];
			instruction.flags &= ~INSTFLAG.isDead;

			// Dead code (JSR is never dead)
			if (instruction.optype != "JSR" && !isNaN(instruction.dest) &&
				this.registers.regs[instruction.dest].status == REGSTAT.W &&
				(!instruction.setCC() || this.registers.regs[8].status == REGSTAT.W)) {
				instruction.flags |= INSTFLAG.isDead;
				continue;
			}

			// Mark regstat accordingly
			if (!isNaN(instruction.dest)) {
				this.registers.regs[instruction.dest].status = REGSTAT.W;
			}
			if (!isNaN(instruction.src)) {
				this.registers.regs[instruction.src].status = REGSTAT.R;
			}
			if (!isNaN(instruction.src2)) {
				this.registers.regs[instruction.src2].status = REGSTAT.R;
			}

			// Special cases
			if (instruction.optype == "BR") {
				this.registers.regs[8].status = REGSTAT.R;
			} else if (instruction.optype == "JSR") {
				let jsrBlock = instruction.jsrTarget?.inBlock;
				// console.log(jsrBlock);
				let regstat = jsrBlock?.registers.getStats();
				// console.log(regstat);
				if (regstat) {
					for (let i = 0; i < 8; i++) {
						this.registers.regs[i].status |= regstat[i];
					}
				}
			} else if (instruction.setCC()) {
				this.registers.regs[8].status = REGSTAT.W;
			}
		}

		// Set restore flags in the last block (return block)
		if (this.isRETBlock()) {
			// Link block with entry block
			let i: number;
			for (i = 0; i < bb.exitBlock.length; i++) {
				if (bb.exitBlock[i] == this) {
					break;
				}
			}
			if (i == bb.exitBlock.length) {
				bb.exitBlock.push(this);
			}

			// Skip the last operation (should be a RET)
			for (let idx = this.instructions.length - 2; idx >= 0; idx--) {
				instruction = this.instructions[idx];
				// Not a load operation, give up
				if (instruction.optype != "LD" || isNaN(instruction.dest)) {
					break;
				}
				// Record restored registers
				this.registers.regs[instruction.dest].flag |= REGFLAG.R;
				this.registers.regs[instruction.dest].savedMem = instruction.mem;
			}
		}
	}

	// Check CC possibility in this block
	public analyzeForward(preCC: number): number {
		let instruction: Instruction;

		// If initial CC didn't change, return immediately
		if (preCC == (this.initialCC & preCC)) {
			return this.flags & BBFLAG.hasChange;
		}

		// Merge cc
		this.initialCC |= preCC;

		// Iterate through instructions
		this.cc = this.initialCC;
		for (let i = 0; i < this.instructions.length; i++) {
			instruction = this.instructions[i];
			// Reset CC possiblity
			if (instruction.setCC()) {
				this.cc = CC.nzp;
				this.flags |= BBFLAG.hasSetCC;
			}
			// Finds BR
			if (instruction.optype == "BR") {
				this.compareCC(this.cc, instruction);
				if ((instruction.flags & INSTFLAG.isAlwaysBR) && instruction.nextInstruction) {
					// Dead path found, loop once more
					this.flags |= BBFLAG.hasChange;
				}
				if ((instruction.flags & INSTFLAG.isNeverBR) && instruction.brTarget) {
					// Dead path found, loop once more
					this.flags |= BBFLAG.hasChange;
				}
				this.cc &= instruction.cc;
				this.flags |= BBFLAG.hasBR;
			}
		}

		// Check for next/br blocks according to whether the last instruction is BR
		if (this.flags & BBFLAG.hasBR) {
			// Next block
			if (this.nextBlock) {
				let mask: CC = this.flags & BBFLAG.hasSetCC ? CC.nzp : this.initialCC;
				this.flags |= this.nextBlock.analyzeForward(~this.cc & mask) & BBFLAG.hasChange;
			}
			// BR block
			if (this.brBlock) {
				this.flags |= this.brBlock.analyzeForward(this.cc) & BBFLAG.hasChange;
			}
		} else if (this.nextBlock) {
			// Only check for next block
			this.flags |= this.nextBlock.analyzeForward(this.cc) & BBFLAG.hasChange;
		}

		return this.flags & BBFLAG.hasChange;
	}

	// Compares a CC with a BR instruction. Returns 0 for conditional branch, 1 for always branch, -1 for redundant condition
	private compareCC(cc: number, inst: Instruction) {
		// Clear previous flags
		if (inst.cc == CC.nzp) {
			return;
		}
		// Clear flags
		inst.flags &= ~(INSTFLAG.isAlwaysBR | INSTFLAG.isNeverBR | INSTFLAG.hasRedundantCC);
		// Always branch
		if (cc == inst.cc) {
			inst.flags |= INSTFLAG.isAlwaysBR;
		}
		// Redundant CC
		if (~(cc & CC.n) & (inst.cc & CC.n)) {
			inst.cc &= ~CC.n;
			inst.redundantCC |= CC.n;
			inst.flags |= INSTFLAG.hasRedundantCC;
		}
		if (~(cc & CC.z) & (inst.cc & CC.z)) {
			inst.cc &= ~CC.z;
			inst.redundantCC |= CC.z;
			inst.flags |= INSTFLAG.hasRedundantCC;
		}
		if (~(cc & CC.p) & (inst.cc & CC.p)) {
			inst.cc &= ~CC.p;
			inst.redundantCC |= CC.p;
			inst.flags |= INSTFLAG.hasRedundantCC;
		}
		// Never branch
		if ((cc & inst.cc) == CC.none) {
			inst.flags |= INSTFLAG.isNeverBR;
		}
	}

	// Returns whether a block is a return block
	private isRETBlock(): boolean {
		return this.instructions[this.instructions.length - 1].optype == "RET";
	}
}

class Register {
	public value: number = NaN;
	public status: REGSTAT = REGSTAT.none;
	public flag: REGFLAG = REGFLAG.none;
	public savedMem: string = "";
	constructor() { }
}

class Registers {
	public regs: Register[] = [];

	constructor() {
		for (let i = 0; i < 9; i++) {
			this.regs.push(new Register());
		}
	}

	public getStats(): Array<REGSTAT> {
		let arr: Array<REGSTAT> = [];
		for (let i = 0; i < 9; i++) {
			arr.push(this.regs[i].status);
		}
		return arr;
	}

	public getFlags(): Array<REGFLAG> {
		let arr: Array<REGFLAG> = [];
		for (let i = 0; i < 9; i++) {
			arr.push(this.regs[i].flag);
		}
		return arr;
	}

	public getMem(): Array<string> {
		let arr: Array<string> = [];
		for (let i = 0; i < 9; i++) {
			arr.push(this.regs[i].savedMem);
		}
		return arr;
	}

}
