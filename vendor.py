import os

from dotenv import load_dotenv
from uagents import Agent, Context
from uagents.setup import fund_agent_if_low

from messages import QuoteAcceptance, ServiceQuote, ServiceRequest

load_dotenv()

AGENTVERSE_KEY = os.getenv("AGENTVERSE_KEY", "")
VENDOR_SEED = "vendor_seed_treehacks_2026"

VENDOR_ABILITY = "plumbing"
# NO DEAL PRICE
VENDOR_PRICE = 3000
# DEAL PRICE
#VENDOR_PRICE = 150

vendor = Agent(
    name="vendor",
    seed=VENDOR_SEED,
    port=8000,
    mailbox=True,
    network="testnet",
)

fund_agent_if_low(vendor.wallet.address())


@vendor.on_event("startup")
async def on_startup(ctx: Context) -> None:
    ctx.logger.info(f"Vendor ready at {vendor.address}")
    if not AGENTVERSE_KEY:
        ctx.logger.warning("AGENTVERSE_KEY is not set.")


@vendor.on_message(model=ServiceRequest)
async def handle_service_request(ctx: Context, sender: str, msg: ServiceRequest) -> None:
    if msg.service_type == VENDOR_ABILITY:
        await ctx.send(
            sender,
            ServiceQuote(price=VENDOR_PRICE, vendor_name="LocalPlumbCo"),
        )


@vendor.on_message(model=QuoteAcceptance)
async def handle_acceptance(ctx: Context, sender: str, msg: QuoteAcceptance) -> None:
    ctx.logger.info(f"Acceptance from {sender}: {msg.text}")


if __name__ == "__main__":
    vendor.run()
