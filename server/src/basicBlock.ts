import {
	Instruction
} from './instruction'

export class BasicBlock {
	public instructions: Instruction[]; 	// Instruction at the same memory address
	public subroutine_num: number;				// Subroutine ID
	public inMultipleRoutine: boolean;		// Flag for accessable from multiple routine
	public next_block: BasicBlock[];

	constructor() {
		this.instructions = [];
		this.subroutine_num = NaN;
		this.inMultipleRoutine = false;
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
