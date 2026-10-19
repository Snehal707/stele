# { "Depends": "py-genlayer:1jb45aa8ynh2a9c9xn3b7qqh8sm5q93hwfp7jqmwsfhh8jpz09h6" }

import genlayer as gl
try:
    from genlayer.types import *
except ModuleNotFoundError:
    from genlayer import *


def _contract_base():
    try:
        return gl.Contract
    except AttributeError:
        return gl.contract.Contract


class ProviderInvoiceFeed(_contract_base()):
    """Native IC equivalent of the sealed EVM feed, for Studio execution.

    A sealed feed is one immutable snapshot, not a continuously updated oracle.
    Ownership proves who published it, not that invoices are independently true.
    """
    provider: Address
    invoice_root: str
    invoice_count: u256
    period: u256
    initialized: bool
    sealed: bool

    def __init__(self):
        self.provider = gl.message.sender_address

    def _only_provider(self) -> None:
        if gl.message.sender_address != self.provider:
            raise gl.vm.UserError("Only provider")

    @gl.public.write
    def update_feed(self, root: str, count: u256, period: u256) -> None:
        self._only_provider()
        if self.sealed:
            raise gl.vm.UserError("feed sealed")
        if len(root) != 64 or any(c not in "0123456789abcdef" for c in root):
            raise gl.vm.UserError("Root must be 64 lowercase hexadecimal characters")
        self.invoice_root = root
        self.invoice_count = count
        self.period = period
        self.initialized = True

    @gl.public.write
    def seal(self) -> None:
        self._only_provider()
        if not self.initialized:
            raise gl.vm.UserError("must call update_feed before seal")
        self.sealed = True

    @gl.public.view
    def snapshot(self) -> dict:
        return {
            "provider": self.provider,
            "invoice_root": self.invoice_root,
            "invoice_count": self.invoice_count,
            "period": self.period,
            "initialized": self.initialized,
            "sealed": self.sealed,
        }
