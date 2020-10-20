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
	public reguse: Array<number>;									// Register use array. 0 for not used, 1 for last access is write, -1 for last access is read
	public savedReg: Array<boolean>; 							// Register save array. true for callee-saved

	constructor() {
		this.reguse = [0, 0, 0, 0, 0, 0, 0, 0];
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
