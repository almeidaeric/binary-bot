import * as actions from '../actions';

const contract = (state = {}, action) => {
    switch (action.type) {
        case actions.OPEN_CONTRACT_RECEIVED:
            return action.data;
        default:
            return state;
    }
};

export default contract;
