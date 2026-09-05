# { "Depends": "py-genlayer:1jb45aa8ynh2a9c9xn3b7qqh8sm5q93hwfp7jqmwsfhh8jpz09h6" }

from genlayer import *


class VaultTwin(gl.Contract):
    balance: u256
    agent: Address
    governor: Address
    spend_total: u256
    destination_count: u256
    payments: TreeMap[Address, u256]
    total: TreeMap[Address, u256]

    def __init__(self, balance: u256, agent: Address, governor: Address):
        self.balance = balance
        self.agent = agent
        self.governor = governor

    @gl.public.view
    def agent_state(self) -> dict:
        return {
            "balance": self.balance,
            "agent": self.agent,
            "governor": self.governor,
            "spend_total": self.spend_total,
            "destination_count": self.destination_count,
            "payments": {
                str(destination): self.payments[destination]
                for destination in self.payments
            },
            "total": {
                str(destination): self.total[destination]
                for destination in self.total
            },
        }

    @gl.public.view
    def get_governor(self) -> Address:
        return self.governor

    # TEST FIXTURE ONLY: seed a complete state in one transaction for
    # deterministic Bradbury demonstrations; not production vault logic.
    @gl.public.write
    def seed_state(
        self,
        spend_total: u256,
        destination_count: u256,
        balance: u256,
        destinations: str,
        payments: str,
        totals: str,
    ) -> None:
        if gl.message.sender_address != self.agent:
            raise gl.vm.UserError("Only the agent can seed the fixture")
        destination_values = destinations.split(",") if destinations else []
        payment_values = payments.split(",") if payments else []
        total_values = totals.split(",") if totals else []
        if len(destination_values) != len(payment_values) or len(destination_values) != len(total_values):
            raise gl.vm.UserError("Fixture arrays must have equal lengths")
        self.spend_total = spend_total
        self.destination_count = destination_count
        self.balance = balance
        for index in range(len(destination_values)):
            destination_text = destination_values[index].strip()
            if destination_text.startswith("address:"):
                destination_text = destination_text[8:]
            destination = Address(destination_text)
            payment_text = payment_values[index].strip()
            total_text = total_values[index].strip()
            if payment_text.startswith("value:"):
                payment_text = payment_text[6:]
            if total_text.startswith("value:"):
                total_text = total_text[6:]
            self.payments[destination] = u256(int(payment_text))
            self.total[destination] = u256(int(total_text))

    @gl.public.write
    def spend(self, destination: Address, amount: u256) -> None:
        if gl.message.sender_address != self.agent:
            raise gl.vm.UserError("Only the agent can spend")
        governor = gl.get_contract_at(self.governor)
        if governor.view().is_halted(self.agent):
            raise gl.vm.UserError("Vault is halted")
        if amount > self.balance:
            raise gl.vm.UserError("Insufficient balance")

        if destination not in self.payments:
            self.destination_count += u256(1)
            self.payments[destination] = u256(0)
            self.total[destination] = u256(0)

        self.payments[destination] += u256(1)
        self.total[destination] += amount
        self.spend_total += amount
        self.balance -= amount
