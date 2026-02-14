import os
from typing import Optional

from dotenv import load_dotenv
from uagents import Agent, Context
from uagents.setup import fund_agent_if_low

from messages import ServiceQuote, ServiceRequest

load_dotenv()

AGENTVERSE_KEY = os.getenv("AGENTVERSE_KEY", "")
ORCHESTRATOR_SEED = "orchestrator_seed_treehacks_2026"

# Replace with your Vendor agent address after starting vendor.py.
VENDOR_ADDRESS = "agent1q2lsm8uvrxjpjssh3mfaafvfnvuw46tzl9fzqtpj7ltepmca57tuu08wqyz"

orchestrator = Agent(
    name="orchestrator",
    seed=ORCHESTRATOR_SEED,
    port=8001,
    mailbox=True,
    network="testnet",
)

fund_agent_if_low(orchestrator.wallet.address())

last_customer: Optional[str] = None


@orchestrator.on_event("startup")
async def on_startup(ctx: Context) -> None:
    ctx.logger.info("Orchestrator Ready")
    if not AGENTVERSE_KEY:
        ctx.logger.warning("AGENTVERSE_KEY is not set.")


@orchestrator.on_message(model=ServiceRequest)
async def handle_request(ctx: Context, sender: str, msg: ServiceRequest) -> None:
    global last_customer
    last_customer = sender
    await ctx.send(VENDOR_ADDRESS, msg)


@orchestrator.on_message(model=ServiceQuote)
async def handle_quote(ctx: Context, sender: str, msg: ServiceQuote) -> None:
    if last_customer:
        await ctx.send(last_customer, msg)
    else:
        ctx.logger.warning("No customer recorded; cannot forward quote.")


if __name__ == "__main__":
    orchestrator.run()
