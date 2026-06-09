use super::gol_utilities::GolUtilitiesComponent;

// Benchmark-only contract. It embeds the real GolUtilitiesComponent so each generation costs
// exactly what production minting/movement costs, and exposes `move_forward_n(n)` to iterate
// Conway's rules `n` times in a single transaction. We push `n` until a transaction can no longer
// be executed on-chain (the step/gas ceiling), and later compare against the SNIP-36 off-chain
// proving ceiling on the same workload. Not part of the product; safe to redeploy/discard.
#[starknet::interface]
pub trait IGolBench<TContractState> {
    // Reset the working state (and the generation counter).
    fn set_state(ref self: TContractState, new_state: u256);
    fn get_state(self: @TContractState) -> u256;
    fn get_age(self: @TContractState) -> u32;
    // Advance `n` generations by looping iterate_life_once (pack/unpack every generation).
    fn move_forward_n(ref self: TContractState, n: u32);
    // Advance `n` generations the cheap way (unpack once, step in place, pack once).
    fn move_forward_in_place(ref self: TContractState, n: u32);
}

#[starknet::contract]
mod GolBench {
    use super::GolUtilitiesComponent;
    use starknet::storage::{StoragePointerReadAccess, StoragePointerWriteAccess};

    component!(path: GolUtilitiesComponent, storage: golutilities, event: GolUtilitiesEvent);

    #[abi(embed_v0)]
    impl GolUtilitiesImpl = GolUtilitiesComponent::GolUtilitiesImpl<ContractState>;

    #[storage]
    struct Storage {
        #[substorage(v0)]
        golutilities: GolUtilitiesComponent::Storage,
        state: u256,
        age: u32,
    }

    #[event]
    #[derive(Drop, starknet::Event)]
    enum Event {
        #[flat]
        GolUtilitiesEvent: GolUtilitiesComponent::Event,
    }

    #[constructor]
    fn constructor(ref self: ContractState, initial_state: u256) {
        self.state.write(initial_state);
    }

    #[abi(embed_v0)]
    impl GolBenchImpl of super::IGolBench<ContractState> {
        fn set_state(ref self: ContractState, new_state: u256) {
            self.state.write(new_state);
            self.age.write(0);
        }
        fn get_state(self: @ContractState) -> u256 {
            self.state.read()
        }
        fn get_age(self: @ContractState) -> u32 {
            self.age.read()
        }
        fn move_forward_n(ref self: ContractState, n: u32) {
            let mut s = self.state.read();
            let mut i: u32 = 0;
            while i < n {
                s = self.golutilities.iterate_life_once(s);
                i += 1;
            };
            self.state.write(s);
            self.age.write(self.age.read() + n);
        }
        fn move_forward_in_place(ref self: ContractState, n: u32) {
            let s = self.golutilities.iterate_life_several_in_place(self.state.read(), n);
            self.state.write(s);
            self.age.write(self.age.read() + n);
        }
    }
}
