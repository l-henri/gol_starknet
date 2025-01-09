/// Interface representing `HelloContract`.
/// This interface allows modification and retrieval of the contract balance.

#[starknet::interface]
pub trait IHelloStarknet<TContractState> {
    /// Increase contract balance.
    fn increase_balance(ref self: TContractState, amount: felt252);
    /// Retrieve contract balance.
    fn get_balance(self: @TContractState) -> felt252;
    /// Iterate state once
    fn iterate_life_once(self: @TContractState,initial_state: felt252) -> felt252;
    // Load grid from state
    fn unpack_grid_from_felt252(self: @TContractState,state: felt252) -> Array<Array<bool>>;
    // Pack grid in felt
    fn pack_grid_in_felt252(self: @TContractState, grid: Array<Array<bool>>) -> felt252;
}

/// Simple contract for managing balance.
#[starknet::contract]
mod GameOfLife {
    // use core::starknet::storage::{StoragePointerReadAccess, StoragePointerWriteAccess};
    use starknet::storage::{
        StoragePointerReadAccess, StoragePointerWriteAccess, Map,
    };
    // use core::starknet::{ContractAddress};
    // use core::dict::Felt252Dict;    
    use core::array::ArrayTrait;
            

    #[storage]
    struct Storage {
        balance: felt252,
    }

    #[abi(embed_v0)]
    impl HelloStarknetImpl of super::IHelloStarknet<ContractState> {
        fn increase_balance(ref self: ContractState, amount: felt252) {
            assert(amount != 0, 'Amount cannot be 0');
            self.balance.write(self.balance.read() + amount);
        }

        fn get_balance(self: @ContractState) -> felt252 {
            self.balance.read()
        }

        fn iterate_life_once(self: @ContractState, initial_state: felt252) -> felt252 {
            let grid = self.unpack_grid_from_felt252(initial_state);
            let mut next_grid: Array<Array<bool>> = ArrayTrait::new();
            // Going though rows
            let mut row: usize = 0;
            loop {
                if row >= 15 {
                    break;
                }
                let mut single_row: Array<bool> = ArrayTrait::new();
                // Going though columns of a specific row
                let mut column: usize = 0;
                loop {
                    if column >= 15 {
                        break;
                    }
                    // Counting neighbouring cells
                    let mut neighbours_count = 0;
                    // 3 cells above
                    if *grid[row-1 % 15][column - 1 % 15] {neighbours_count += 1;}
                    if *grid[row-1 % 15][column] {neighbours_count += 1;}
                    if *grid[row-1 % 15][column + 1 % 15] {neighbours_count += 1;}
                    // A cell to the left, a cell to the right
                    if *grid[row][column + 1 % 15] {neighbours_count += 1;}
                    if *grid[row][column - 1 % 15] {neighbours_count += 1;}
                    // 3 cells below
                    if *grid[row+1 % 15][column - 1 % 15] {neighbours_count += 1;}
                    if *grid[row+1 % 15][column] {neighbours_count += 1;}
                    if *grid[row+1 % 15][column + 1 % 15] {neighbours_count += 1;}
                    
                    // If cell is alive .... 
                    if *grid[row][column] {
                        // It lives if it has 2 or 3 neighbours
                        if neighbours_count == 2
                            {single_row.append(true);}
                        else if neighbours_count == 3
                            {single_row.append(true);}
                        // It dies otherwise
                        else 
                            {single_row.append(false);}
                        
                    }
                    // If cell is dead...
                    else {
                        // It lives if it has exactly 3 neighbours
                        if neighbours_count == 3
                            {single_row.append(true);}
                        // It stays dead otherwise
                        else 
                            {single_row.append(false);}
                    }
                    column += 1;
                };
                next_grid.append(single_row);
                row += 1;
            };
            self.pack_grid_in_felt252(next_grid)
        }

        fn unpack_grid_from_felt252(self: @ContractState, state: felt252) -> Array<Array<bool>> {
            let mut state_as_u256 : u256 = state.into();
            let mut grid: Array<Array<bool>> = ArrayTrait::new();
            let mut power: u256 = 1;
            // Going though rows
            let mut row: usize = 0;
            loop {
                if row >= 15 {
                    break;
                    }
                let mut single_row: Array<bool> = ArrayTrait::new();

                // Going though columns of a specific row
                let mut column: usize = 0;
                loop {
                    if column >= 15 {
                        break;
                    }
                    // let test3 = test & test2;
                    let pixel = state_as_u256 & power;
                    if pixel != 0 {
                        single_row.append(true);
                    }
                    else {
                        single_row.append(false);
                    }
                    column += 1;
                    power *=2;
                    };
                grid.append(single_row);
                row += 1;
            };
            grid
        }

        fn pack_grid_in_felt252(self: @ContractState, grid: Array<Array<bool>>) -> felt252 {
            let mut packed_state: felt252 = 0;
            let mut power: felt252 = 1;
            // Going though rows
            let mut row: usize = 0;
            loop {
                if row >= 15 {
                    break;
                }
                // Going though columns of a specific row
                let mut column: usize = 0;
                loop {
                    if column >= 15 {
                        break;
                    }
                    
                    if *grid[row][column] {
                        packed_state += power;
                    }
                    power *= 2; // Increment power for the next cell
                    column += 1;
                    };
                row += 1;
            };
           
            
            packed_state
        }

    }
}
