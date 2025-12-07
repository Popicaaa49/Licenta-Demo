// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

contract GameEscrow {
    enum MatchState {
        WaitingOpponent,
        InProgress,
        Finished
    }

    struct Match {
        address player1;
        address player2;
        uint256 betAmount;
        MatchState state;
        address winner;
        address currentTurn;
        uint8 moves;
        uint8[9] board;
    }

    struct PlayerRating {
        int256 elo;
        bool initialized;
    }

    uint256 public constant BOARD_SIZE = 9;
    int256 public constant DEFAULT_ELO = 1000;
    int256 public constant ELO_DELTA = 25;

    uint256 public matchCount;
    mapping(uint256 => Match) public matches;
    mapping(address => uint256[]) private playerMatchIds;
    mapping(address => PlayerRating) private playerRatings;

    event MatchCreated(uint256 indexed matchId, address indexed player1, uint256 betAmount);
    event MatchJoined(uint256 indexed matchId, address indexed player2);
    event MatchStarted(uint256 indexed matchId, address indexed currentTurn);
    event MovePlayed(
        uint256 indexed matchId,
        address indexed player,
        uint8 position,
        uint8 mark
    );
    event MatchFinished(uint256 indexed matchId, address winner, bool isDraw, uint256 payout);
    event EloUpdated(address indexed player, int256 newElo);

    error InvalidBet();
    error MatchNotFound();
    error MatchNotActive();
    error MatchNotInProgress();
    error AlreadyHasOpponent();
    error CreatorCannotJoin();
    error IncorrectBetAmount();
    error NotParticipant();
    error NotPlayerTurn();
    error InvalidMove();

    /// @notice Player1 creates the match and deposits the initial bet.
    function createMatch() external payable returns (uint256 matchId) {
        if (msg.value == 0) {
            revert InvalidBet();
        }

        matchId = matchCount;
        Match storage m = matches[matchId];

        m.player1 = msg.sender;
        m.player2 = address(0);
        m.betAmount = msg.value;
        m.state = MatchState.WaitingOpponent;
        m.winner = address(0);
        m.currentTurn = address(0);
        m.moves = 0;

        for (uint256 i = 0; i < BOARD_SIZE; i++) {
            m.board[i] = 0;
        }

        matchCount++;

        playerMatchIds[msg.sender].push(matchId);

        emit MatchCreated(matchId, msg.sender, msg.value);
    }

    /// @notice Player2 joins an existing match by matching the initial bet.
    function joinMatch(uint256 matchId) external payable {
        Match storage m = matches[matchId];

        if (m.player1 == address(0)) revert MatchNotFound();
        if (m.state != MatchState.WaitingOpponent) revert AlreadyHasOpponent();
        if (msg.sender == m.player1) revert CreatorCannotJoin();
        if (msg.value != m.betAmount) revert IncorrectBetAmount();

        m.player2 = msg.sender;
        m.state = MatchState.InProgress;
        m.currentTurn = m.player1;

        playerMatchIds[msg.sender].push(matchId);

        emit MatchJoined(matchId, msg.sender);
        emit MatchStarted(matchId, m.currentTurn);
    }

    /// @notice Execute a Tic-Tac-Toe move at a given board index (0-8).
    function makeMove(uint256 matchId, uint8 position) external {
        Match storage m = matches[matchId];

        if (m.player1 == address(0)) revert MatchNotFound();
        if (m.state != MatchState.InProgress) revert MatchNotInProgress();
        if (msg.sender != m.player1 && msg.sender != m.player2) revert NotParticipant();
        if (msg.sender != m.currentTurn) revert NotPlayerTurn();
        if (position >= BOARD_SIZE) revert InvalidMove();
        if (m.board[position] != 0) revert InvalidMove();

        uint8 mark = msg.sender == m.player1 ? 1 : 2;
        m.board[position] = mark;
        m.moves += 1;

        emit MovePlayed(matchId, msg.sender, position, mark);

        if (_hasWinningLine(m.board, mark)) {
            _finalizeMatchWithWinner(m, matchId, msg.sender);
            return;
        }

        if (m.moves == BOARD_SIZE) {
            _finalizeDraw(m, matchId);
            return;
        }

        m.currentTurn = msg.sender == m.player1 ? m.player2 : m.player1;
    }

    function getMatches() external view returns (Match[] memory) {
        Match[] memory allMatches = new Match[](matchCount);
        for (uint256 i = 0; i < matchCount; i++) {
            allMatches[i] = matches[i];
        }
        return allMatches;
    }

    function getMatch(uint256 matchId) external view returns (Match memory) {
        Match memory m = matches[matchId];
        if (m.player1 == address(0)) revert MatchNotFound();
        return m;
    }

    function getPlayerMatchIds(address player) external view returns (uint256[] memory) {
        return playerMatchIds[player];
    }

    function getPlayerHistory(address player)
        external
        view
        returns (Match[] memory playerMatches, uint256[] memory matchIds)
    {
        uint256[] storage ids = playerMatchIds[player];
        uint256 length = ids.length;

        matchIds = new uint256[](length);
        playerMatches = new Match[](length);

        for (uint256 i = 0; i < length; i++) {
            uint256 id = ids[i];
            matchIds[i] = id;
            playerMatches[i] = matches[id];
        }
    }

    function getPlayerElo(address player) external view returns (int256) {
        PlayerRating memory profile = playerRatings[player];
        if (!profile.initialized) {
            return DEFAULT_ELO;
        }
        return profile.elo;
    }

    // ---- Internal helpers ----

    function _hasWinningLine(uint8[9] storage board, uint8 mark) private view returns (bool) {
        uint8[3][8] memory lines = [
            [uint8(0), uint8(1), uint8(2)],
            [uint8(3), uint8(4), uint8(5)],
            [uint8(6), uint8(7), uint8(8)],
            [uint8(0), uint8(3), uint8(6)],
            [uint8(1), uint8(4), uint8(7)],
            [uint8(2), uint8(5), uint8(8)],
            [uint8(0), uint8(4), uint8(8)],
            [uint8(2), uint8(4), uint8(6)]
        ];

        for (uint256 i = 0; i < lines.length; i++) {
            uint8[3] memory line = lines[i];
            if (
                board[line[0]] == mark && board[line[1]] == mark && board[line[2]] == mark
            ) {
                return true;
            }
        }
        return false;
    }

    function _finalizeMatchWithWinner(
        Match storage m,
        uint256 matchId,
        address winner
    ) private {
        m.state = MatchState.Finished;
        m.winner = winner;
        m.currentTurn = address(0);

        uint256 payout = m.betAmount * 2;
        _updateEloForOutcome(m.player1, m.player2, winner);

        _safeTransfer(winner, payout);

        emit MatchFinished(matchId, winner, false, payout);
    }

    function _finalizeDraw(Match storage m, uint256 matchId) private {
        m.state = MatchState.Finished;
        m.winner = address(0);
        m.currentTurn = address(0);

        uint256 refundAmount = m.betAmount;

        _ensurePlayerRating(m.player1);
        _ensurePlayerRating(m.player2);

        _safeTransfer(m.player1, refundAmount);
        _safeTransfer(m.player2, refundAmount);

        emit MatchFinished(matchId, address(0), true, refundAmount * 2);
    }

    function _safeTransfer(address to, uint256 amount) private {
        (bool ok, ) = payable(to).call{value: amount}("");
        require(ok, "Transfer failed");
    }

    function _updateEloForOutcome(
        address player1,
        address player2,
        address winner
    ) private {
        if (player1 == address(0) || player2 == address(0) || winner == address(0)) {
            return;
        }

        address loser = winner == player1 ? player2 : player1;

        PlayerRating storage winnerRating = _ensurePlayerRating(winner);
        PlayerRating storage loserRating = _ensurePlayerRating(loser);

        winnerRating.elo += ELO_DELTA;
        loserRating.elo -= ELO_DELTA;

        emit EloUpdated(winner, winnerRating.elo);
        emit EloUpdated(loser, loserRating.elo);
    }

    function _ensurePlayerRating(address player) private returns (PlayerRating storage profile) {
        profile = playerRatings[player];
        if (!profile.initialized) {
            profile.elo = DEFAULT_ELO;
            profile.initialized = true;
        }
    }
}
