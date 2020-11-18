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
	public regstat: Array<REGSTAT>;								// Register use array. The 9th element is for CC.
	public regflag: Array<REGFLAG>;								// Register flag array.
	public savedRegMem: Array<string>; 						// Register save information: which memory location is saved to
	public cc: CC = CC.none; 											// CC, see CC definition in instruction.ts. 1 means the CC is possible to appear in the condition code
	public initialCC: CC = CC.none; 							// Initial CC, 1 means the CC is possible to appear in the condition code

	constructor() {
		this.regstat = [REGSTAT.none, REGSTAT.none, REGSTAT.none, REGSTAT.none,
		REGSTAT.none, REGSTAT.none, REGSTAT.none, REGSTAT.none, REGSTAT.none];  // Added one extra slot for cc
		this.regflag = [REGFLAG.none, REGFLAG.none, REGFLAG.none, REGFLAG.none,
		REGFLAG.none, REGFLAG.none, REGFLAG.none, REGFLAG.none];
		this.savedRegMem = ["", "", "", "", "", "", "", ""];
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
			return this.regstat;
		}
		this.flags |= BBFLAG.hasCheckedBackward;

		// Get regstat from next blocks, merge them
		if (this.nextBlock) {
			regstat1 = this.nextBlock.analyzeBackward(bb);
			for (let i = 0; i < 8; i++) {
				this.regstat[i] |= regstat1[i];
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
				this.regstat[i] |= regstat2[i];
			}
		}

		this.analyzeInstructionsBackward(bb);
		return this.regstat;
	}

	private analyzeInstructionsBackward(bb: BasicBlock) {
		let instruction: Instruction;

		// Iterate backward
		for (let idx = this.instructions.length - 1; idx >= 0; idx--) {
			instruction = this.instructions[idx];
			instruction.flags &= ~INSTFLAG.isDead;

			// Dead code (JSR is never dead)
			if (instruction.optype != "JSR" && !isNaN(instruction.dest) &&
				this.regstat[instruction.dest] == REGSTAT.W &&
				(!instruction.setCC() || this.regstat[8] == REGSTAT.W)) {
				instruction.flags |= INSTFLAG.isDead;
				continue;
			}

			// Mark regstat accordingly
			if (!isNaN(instruction.dest)) {
				this.regstat[instruction.dest] = REGSTAT.W;
			}
			if (!isNaN(instruction.src)) {
				this.regstat[instruction.src] = REGSTAT.R;
			}
			if (!isNaN(instruction.src2)) {
				this.regstat[instruction.src2] = REGSTAT.R;
			}

			// Special cases
			if (instruction.optype == "BR") {
				this.regstat[8] = REGSTAT.R;
			} else if (instruction.optype == "JSR") {
				// TODO: only mark registers JSR touched
				for (let i = 0; i < 8; i++) {
					this.regstat[i] = REGSTAT.R;
				}
			} else if (instruction.setCC()) {
				this.regstat[8] = REGSTAT.W;
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
				if (instruction.optype != "LD") {
					break;
				}
				// Record restored registers
				this.regflag[instruction.dest] |= REGFLAG.R;
				this.savedRegMem[instruction.dest] = instruction.mem;
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
