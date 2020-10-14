import {
	Instruction
} from './instruction'

export class BasicBlock {
	public instructions: Instruction[]; 	// Instruction at the same memory address
	public subroutine_num: number;				// Subroutine ID
	public overlapNumber: number;					// Subroutine ID of the other subroutine, if any
	public hasExplored: boolean;					// Flag indicating a bb has been explored
	public hasCheckedDeadCode: boolean; 	// Flag indicating a bb has been checked for dead code
	public hasCheckedRestore: boolean;		// Flag indicating a bb has been checked for restore
	public next_block: BasicBlock[];			// Next block pointer
	public reguse: Array<number>;					// Register use array. 0 for not used, 1 for last access is write, -1 for last access is read
	public savedReg: Array<boolean>; 			// Register save array. true for callee-saved

	constructor() {
		this.instructions = [];
		this.subroutine_num = NaN;		
		this.overlapNumber = NaN;
		this.hasExplored = false;
		this.hasCheckedDeadCode = false;
		this.hasCheckedRestore = false;
		this.next_block = [];
		this.reguse = [0,0,0,0,0,0,0,0];
		this.savedReg = [false, false, false, false, false, false, false, false];
	}

	// Push an instruction into the basic block
	public pushInstruction(instruction: Instruction) {
		if (this.instructions.length == 0) {
			this.subroutine_num = instruction.subroutine_num;
		}
		this.instructions.push(instruction);
	}
}
