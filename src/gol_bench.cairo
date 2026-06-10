use super::gol_utilities::GolUtilitiesComponent;

// Benchmark-only contract. It embeds the real GolUtilitiesComponent so each generation costs
// exactly what production minting/movement costs, and exposes `move_forward_n(n)` to iterate
// Conway's rules `n` times in a single transaction. We push `n` until a transaction can no longer
// be executed on-chain (the step/gas ceiling), and later compare against the SNIP-36 off-chain
// proving ceiling on the same workload. Not part of the product; safe to redeploy/discard.
// The proven result of advancing `start_state` by `generations` steps. Emitted as the single
// L2->L1 message of the virtual `prove_move_forward_n`, and re-checked on-chain by `verify`.
#[derive(Drop, Serde, Copy)]
pub struct MoveMessage {
    pub start_state: u256,
    pub final_state: u256,
    pub generations: u32,
}

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
    // PROBE: read the number of SNIP-36 proof facts attached to this tx (0 for a normal call).
    // Only here to confirm the corelib exposes tx_info.proof_facts before we build the real flow.
    fn proof_facts_len(self: @TContractState) -> u32;
    // VIRTUAL (proven off-chain, never broadcast): advance `start_state` by `n` generations and
    // emit the result as the single L2->L1 message. This is the workload whose off-chain proving
    // ceiling we benchmark — bounded by the prover, not the 1.2e9-gas-per-tx on-chain cap.
    fn prove_move_forward_n(ref self: TContractState, start_state: u256, n: u32);
    // ON-CHAIN: submitted with { proof, proof_facts }. Checks the proof commits exactly `message`,
    // then persists it cheaply (no iteration on-chain).
    fn verify_move_forward(ref self: TContractState, message: MoveMessage);
}

#[starknet::contract]
mod GolBench {
    use super::{GolUtilitiesComponent, MoveMessage};
    use starknet::{SyscallResultTrait, ContractAddress, get_contract_address};
    use core::poseidon::poseidon_hash_span;
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
        fn proof_facts_len(self: @ContractState) -> u32 {
            let info = starknet::syscalls::get_execution_info_v3_syscall()
                .unwrap_syscall()
                .unbox();
            let tx_info = info.tx_info.unbox();
            tx_info.proof_facts.len()
        }
        fn prove_move_forward_n(ref self: ContractState, start_state: u256, n: u32) {
            let final_state = self.golutilities.iterate_life_several_in_place(start_state, n);
            let message = MoveMessage { start_state, final_state, generations: n };
            let mut payload: Array<felt252> = array![];
            message.serialize(ref payload);
            starknet::syscalls::send_message_to_l1_syscall(0, payload.span()).unwrap_syscall();
        }
        fn verify_move_forward(ref self: ContractState, message: MoveMessage) {
            let info = starknet::syscalls::get_execution_info_v3_syscall()
                .unwrap_syscall()
                .unbox();
            let proof_facts = info.tx_info.unbox().proof_facts;
            // proof_facts[8] is the Poseidon hash of the first (only) L2->L1 message the proof
            // committed; it must equal the hash recomputed from the message submitted here.
            assert(*proof_facts.at(8) == message_hash(get_contract_address(), message), 'Proof message mismatch');
            self.state.write(message.final_state);
            self.age.write(self.age.read() + message.generations);
        }
    }

    // Poseidon hash over (from_address, to_address=0, payload_len, ...payload) — matching how the
    // prover hashes the emitted L2->L1 message into proof_facts[8].
    fn message_hash(contract_addr: ContractAddress, message: MoveMessage) -> felt252 {
        let mut payload: Array<felt252> = array![];
        message.serialize(ref payload);
        let mut data: Array<felt252> = array![contract_addr.into(), 0, payload.len().into()];
        let mut i: u32 = 0;
        while i < payload.len() {
            data.append(*payload.at(i));
            i += 1;
        };
        poseidon_hash_span(data.span())
    }
}
