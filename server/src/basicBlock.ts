import {
	Instruction
} from './instruction'

export class BasicBlock {
	public instructions: Instruction[]; 	// Instruction at the same memory address
	public subroutine_num: number;				// Subroutine ID
	public overlapNumber: number;					// Subroutine ID of the other subroutine, if any
	public hasExplored: boolean;						// Flag indicating a bb has been explored
	public next_block: BasicBlock[];

	constructor() {
		this.instructions = [];
		this.subroutine_num = NaN;		
		this.overlapNumber = NaN;
		this.hasExplored = false;
		this.next_block = [];
	}

	// Push an instruction into the basic block
	public pushInstruction(instruction: Instruction) {
		if (this.instructions.length == 0) {
			this.subroutine_num = instruction.subroutine_num;
		}
		this.instructions.push(instruction);
	}
}
