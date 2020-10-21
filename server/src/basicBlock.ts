import { RegistrationRequest } from "vscode-languageserver";
import {
	Instruction
} from './instruction'

export class BasicBlock {
	public instructions: Instruction[] = []; 			// Instruction at the same memory address
	public subroutine_num: number = NaN;					// Subroutine ID
	public overlapNumber: number = NaN;						// Subroutine ID of the other subroutine, if any
	public hasExplored: boolean = false;					// Flag indicating a bb has been explored
	public hasCheckedDeadCode: boolean = false; 	// Flag indicating a bb has been checked for dead code
	public hasCheckedRestore: boolean = false;		// Flag indicating a bb has been checked for restore
	public next_block: BasicBlock[] = [];					// Next block pointer
	public reguse: Array<number>;									// Register use array. 0 for not used, -1 for last access is write, 1 for last access is read
	public savedReg: Array<boolean>; 							// Register save array. true for callee-saved
	public restoredReg: Array<boolean>; 					// Register restore array. true for callee-saved

	constructor() {
		this.reguse = [0, 0, 0, 0, 0, 0, 0, 0];
		this.savedReg = [false, false, false, false, false, false, false, false];
		this.restoredReg = [false, false, false, false, false, false, false, false];
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

		if (this.hasCheckedDeadCode) {
			return this.reguse;
		}
		this.hasCheckedDeadCode = true;

		// Get reguse from next blocks
		if (this.next_block.length > 1) {
			reguse1 = this.next_block[0].checkDeadCode();
			reguse2 = this.next_block[1].checkDeadCode();
		} else if (this.next_block.length > 0) {
			reguse1 = this.next_block[0].checkDeadCode();
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
	public checkRestoredReg(): Array<boolean> {
		let idx: number, i: number;
		let instruction: Instruction;
		let restoredReg1 = null;
		let restoredReg2 = null;

		if (this.hasCheckedRestore) {
			return this.restoredReg;
		}
		this.hasCheckedRestore = true;

		// Get reguse from next blocks
		if (this.next_block.length > 1) {
			restoredReg1 = this.next_block[0].checkRestoredReg();
			restoredReg2 = this.next_block[1].checkRestoredReg();
		} else if (this.next_block.length > 0) {
			restoredReg1 = this.next_block[0].checkRestoredReg();
		}

		// Merge restored registers
		if (restoredReg1 && restoredReg2) {
			for (i = 0; i < 8; i++) {
				this.restoredReg[i] = restoredReg1[i] && restoredReg2[i];
			}
		} else if (restoredReg1) {
			for (i = 0; i < 8; i++) {
				this.restoredReg[i] = restoredReg1[i];
			}
		}

		// The last block (return block)
		if (this.isRETBlock()) {
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
		return this.restoredReg;
	}

	private isRETBlock(): boolean {
		return (this.next_block.length == 0 && this.instructions[this.instructions.length - 1].optype == "RET");
	}
}
