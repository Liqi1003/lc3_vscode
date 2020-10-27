export enum BBFLAG {
	none = 0x0,
	hasExplored = 0x1,
	hasCheckedDeadCode = 0x2,
	hasCheckedRestore = 0x4,
	hasCheckedCC = 0x8,
	hasChange = 0x10,
	hasBR = 0x20,
}

import {
	CC,
	INSTFLAG,
	Instruction,
} from './instruction'

export class BasicBlock {
	public instructions: Instruction[] = []; 			// Instruction at the same memory address
	public subroutineNum: number = NaN;					  // Subroutine ID
	public overlapNumber: number = NaN;						// Subroutine ID of the other subroutine, if any
	public nextBlock: BasicBlock | null = null;   // Next block pointer
	public brBlock: BasicBlock | null = null;		  // Branch block pointer
	public exitBlock: BasicBlock[] = [];  				// Exit blocks of a subroutine, only valid for subroutine start blocks
	public flags: number = BBFLAG.none;						// Flags - see BBFLAG structure definition
	public reguse: Array<number>;									// Register use array. 0 for not used, -1 for last access is write, 1 for last access is read
																								// Reguse[8] is CC usage
	public savedReg: Array<boolean>; 							// Register save array. true for callee-saved, only valid for entry blocks
	public restoredReg: Array<boolean>; 					// Register restore array. true for callee-saved, only valid for entry and exit blocks
	public cc: CC = CC.none; 											// CC, see CC definition in instruction.ts. 1 means the CC is possible to appear in the condition code
	public initialCC: CC = CC.none; 							// Initial CC, 1 means the CC is possible to appear in the condition code

	constructor() {
		this.reguse = [0, 0, 0, 0, 0, 0, 0, 0, 0];  // Added one extra slot for cc
		this.savedReg = [false, false, false, false, false, false, false, false];
		this.restoredReg = [false, false, false, false, false, false, false, false];
	}

	// Push an instruction into the basic block
	public pushInstruction(instruction: Instruction) {
		if (this.instructions.length == 0) {
			this.subroutineNum = instruction.subroutineNum;
		}
		this.instructions.push(instruction);
	}

	// Check for dead code in this block
	public checkDeadCode(): Array<number> {
		let idx: number, i: number;
		let instruction: Instruction;
		let reguse1 = null;
		let reguse2 = null;

		if (this.flags & BBFLAG.hasCheckedDeadCode) {
			return this.reguse;
		}
		this.flags |= BBFLAG.hasCheckedDeadCode;

		// Get reguse from next blocks
		if (this.nextBlock) {
			reguse1 = this.nextBlock.checkDeadCode();
		}
		if (this.brBlock) {
			reguse2 = this.brBlock.checkDeadCode();
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
			if (!isNaN(instruction.dest) &&
				this.reguse[instruction.dest] == -1 &&
				this.reguse[8] == -1) {
				instruction.flags |= INSTFLAG.isDead;
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
			if (instruction.optype == "BR") {
				this.reguse[8] = 1;
			} else if (instruction.setCC()) {
				this.reguse[8] = -1;
			}
		}
		return this.reguse;
	}

	// Check for restored register in this block
	public checkRestoredReg(bb: BasicBlock) {
		let idx: number, i: number;
		let instruction: Instruction;

		if (this.flags & BBFLAG.hasCheckedRestore) {
			return this.restoredReg;
		}
		this.flags |= BBFLAG.hasCheckedRestore;

		if (this.nextBlock) {
			this.nextBlock.checkRestoredReg(bb);
		}
		if (this.brBlock) {
			this.brBlock.checkRestoredReg(bb);
		}

		// The last block (return block)
		if (this.isRETBlock()) {
			// Link block with entry block
			bb.exitBlock.push(this);
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
	public checkCC(preCC: number): number {
		let idx: number;
		let instruction: Instruction;

		// If initial CC didn't change, return immediately
		if (preCC == (this.initialCC & preCC)) {
			return this.flags & BBFLAG.hasChange;
		}

		// Merge cc
		this.initialCC |= preCC;

		// Iterate through instructions
		this.cc = this.initialCC;
		for (idx = 0; idx < this.instructions.length; idx++) {
			instruction = this.instructions[idx];
			// Reset CC possiblity
			if (instruction.setCC()) {
				this.cc = CC.nzp;
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

		if (this.flags & BBFLAG.hasBR) {
			// Next block
			if (this.nextBlock) {
				this.flags |= this.nextBlock.checkCC(~this.cc & this.initialCC) & BBFLAG.hasChange;
			}
			// BR block
			if (this.brBlock) {
				this.flags |= this.brBlock.checkCC(this.cc) & BBFLAG.hasChange;
			}
		} else if (this.nextBlock) {
			// Only check for next block
			this.flags |= this.nextBlock.checkCC(this.cc) & BBFLAG.hasChange;
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
		if (!(cc & CC.n) && (inst.cc & CC.n)) {
			inst.cc &= ~CC.n;
			inst.redundantCC |= CC.n;
			inst.flags |= INSTFLAG.hasRedundantCC;
		}
		if (!(cc & CC.z) && (inst.cc & CC.z)) {
			inst.cc &= ~CC.z;
			inst.redundantCC |= CC.z;
			inst.flags |= INSTFLAG.hasRedundantCC;
		}
		if (!(cc & CC.p) && (inst.cc & CC.p)) {
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
