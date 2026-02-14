import os

from dotenv import load_dotenv
from uagents import Agent, Context
from uagents.setup import fund_agent_if_low

from messages import QuoteAcceptance, ServiceQuote, ServiceRequest

load_dotenv()

AGENTVERSE_KEY = os.getenv("AGENTVERSE_KEY", "")
CUSTOMER_SEED = "customer_seed_treehacks_2026"

# Replace with your Orchestrator agent address after starting orchestrator.py.
ORCHESTRATOR_ADDRESS = "agent1q0sewr2pg82xzuqzvj98usjdtc9zyrdlrgpsqh0gp4uw4cvh3ujp7452dwu"
MAX_BUDGET = 200

customer = Agent(
    name="customer",
    seed=CUSTOMER_SEED,
    port=8002,
    mailbox=True,
    network="testnet",
)

fund_agent_if_low(customer.wallet.address())


@customer.on_event("startup")
async def on_startup(ctx: Context) -> None:
    if not AGENTVERSE_KEY:
        ctx.logger.warning("AGENTVERSE_KEY is not set.")
    await ctx.send(
        ORCHESTRATOR_ADDRESS,
        ServiceRequest(service_type="plumbing", max_price=MAX_BUDGET),
    )


@customer.on_message(model=ServiceQuote)
async def handle_quote(ctx: Context, sender: str, msg: ServiceQuote) -> None:
    if msg.price <= MAX_BUDGET:
        print("DEAL!")
        await ctx.send(
            sender,
            QuoteAcceptance(text=f"Accepted {msg.vendor_name} at ${msg.price}"),
        )
    else:
        print(
            f"NO DEAL. {msg.vendor_name} quoted ${msg.price}, "
            f"which exceeds your budget of ${MAX_BUDGET}."
        )


if __name__ == "__main__":
    customer.run()
